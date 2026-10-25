package fr.alykell.aloria.hud;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.resource.ResourcePackLoader;

/**
 * Pack de textures Modrinth activable en un clic depuis l'écran Visuel (onglet Autres), comme dans mod/ :
 * téléchargé dans resourcepacks/ dans sa version 1.8, puis ajouté en tête des packs choisis (sans relancer le jeu).
 */
public final class ModrinthPack {
	/** NoBlockRotations : herbe, terre, sable, pierre… toujours dans le même sens (rotation aléatoire des textures retirée) */
	public static final ModrinthPack NO_ROTATION = new ModrinthPack("noblockrotations", "NoBlockRotations ");

	/** Version des packs demandée à Modrinth : ils sont publiés pour « 1.8 », valable pour la 1.8.9 */
	private static final String GAME = "1.8";

	public enum Status { IDLE, DOWNLOADING, FAILED, UNAVAILABLE }

	private final String project;
	/** Début du nom des fichiers téléchargés : sert à reconnaître le pack parmi ceux du jeu */
	private final String filePrefix;
	private volatile Status status = Status.IDLE;

	private ModrinthPack(String project, String filePrefix) {
		this.project = project;
		this.filePrefix = filePrefix;
	}

	public Status status() {
		return status;
	}

	/** Le pack est activé dans le jeu */
	public boolean active() {
		for (ResourcePackLoader.Entry entry : MinecraftClient.getInstance().getResourcePackLoader().getSelectedResourcePacks()) {
			if (entry.getName().startsWith(filePrefix)) return true;
		}
		return false;
	}

	public void toggle() {
		if (status == Status.DOWNLOADING) return;
		if (active()) disable();
		else enable();
	}

	private void disable() {
		ResourcePackLoader loader = MinecraftClient.getInstance().getResourcePackLoader();
		List<ResourcePackLoader.Entry> selected = new ArrayList<>(loader.getSelectedResourcePacks());
		selected.removeIf(entry -> entry.getName().startsWith(filePrefix));
		apply(selected);
		status = Status.IDLE;
	}

	private void enable() {
		status = Status.DOWNLOADING;
		Thread thread = new Thread(() -> {
			try {
				String fileName = download();
				if (fileName == null) {
					status = Status.UNAVAILABLE;
					return;
				}
				MinecraftClient.getInstance().submit(() -> {
					ResourcePackLoader loader = MinecraftClient.getInstance().getResourcePackLoader();
					loader.initResourcePacks();
					for (ResourcePackLoader.Entry entry : loader.getAvailableResourcePacks()) {
						if (!entry.getName().equals(fileName)) continue;
						// Le dernier de la liste passe par-dessus les autres
						List<ResourcePackLoader.Entry> selected = new ArrayList<>(loader.getSelectedResourcePacks());
						selected.add(entry);
						apply(selected);
						status = Status.IDLE;
						return;
					}
					AloriaHud.LOGGER.warn("Pack {} introuvable après téléchargement", fileName);
					status = Status.FAILED;
				});
			} catch (IOException | RuntimeException e) {
				AloriaHud.LOGGER.warn("Téléchargement du pack {} impossible", project, e);
				status = Status.FAILED;
			}
		}, "Aloria HUD - " + project);
		thread.setDaemon(true);
		thread.start();
	}

	/** Packs choisis enregistrés comme le fait l'écran des packs du jeu, puis ressources rechargées */
	private static void apply(List<ResourcePackLoader.Entry> selected) {
		MinecraftClient mc = MinecraftClient.getInstance();
		mc.getResourcePackLoader().setSelectedResourcePacks(selected);
		mc.options.resourcePacks.clear();
		mc.options.incompatibleResourcePacks.clear();
		for (ResourcePackLoader.Entry entry : selected) {
			mc.options.resourcePacks.add(entry.getName());
			if (entry.getFormat() != 1) mc.options.incompatibleResourcePacks.add(entry.getName());
		}
		mc.options.save();
		mc.reloadResources();
	}

	/** Télécharge la version 1.8 du pack (si elle n'est pas déjà là) ; null si Modrinth n'en a pas */
	private String download() throws IOException {
		String query = "game_versions=" + URLEncoder.encode("[\"" + GAME + "\"]", "UTF-8")
			+ "&loaders=" + URLEncoder.encode("[\"minecraft\"]", "UTF-8");
		JsonArray versions = new JsonParser().parse(new String(fetch("https://api.modrinth.com/v2/project/" + project + "/version?" + query),
			StandardCharsets.UTF_8)).getAsJsonArray();
		if (versions.size() == 0) return null;

		JsonObject version = versions.get(0).getAsJsonObject();
		JsonObject file = null;
		for (JsonElement f : version.getAsJsonArray("files")) {
			if (file == null || f.getAsJsonObject().get("primary").getAsBoolean()) file = f.getAsJsonObject();
		}
		if (file == null) return null;

		String fileName = filePrefix + version.get("version_number").getAsString().replaceAll("[^A-Za-z0-9._+-]", "_") + ".zip";
		File packs = MinecraftClient.getInstance().getResourcePackLoader().getResourcePackDir();
		File target = new File(packs, fileName);
		String sha1 = file.getAsJsonObject("hashes").get("sha1").getAsString();
		if (target.isFile() && sha1.equalsIgnoreCase(sha1(Files.readAllBytes(target.toPath())))) return fileName;

		byte[] data = fetch(file.get("url").getAsString());
		if (!sha1.equalsIgnoreCase(sha1(data))) throw new IOException("Fichier abîmé (sha1 différent)");
		packs.mkdirs();
		File temp = new File(packs, fileName + ".part");
		Files.write(temp.toPath(), data);
		Files.move(temp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
		return fileName;
	}

	private static byte[] fetch(String url) throws IOException {
		HttpURLConnection http = (HttpURLConnection) new URL(url).openConnection();
		http.setConnectTimeout(10_000);
		http.setReadTimeout(60_000);
		http.setRequestProperty("User-Agent", "Alykell/Aloria-HUD (github.com/Alykell/Aloria)");
		if (http.getResponseCode() != 200) throw new IOException("Modrinth : code " + http.getResponseCode());
		try (InputStream in = http.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
			byte[] buffer = new byte[8192];
			for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
			return out.toByteArray();
		}
	}

	private static String sha1(byte[] bytes) {
		try {
			StringBuilder hex = new StringBuilder();
			for (byte b : MessageDigest.getInstance("SHA-1").digest(bytes)) hex.append(String.format("%02x", b));
			return hex.toString();
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
