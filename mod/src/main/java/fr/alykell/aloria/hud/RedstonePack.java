package fr.alykell.aloria.hud;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.server.packs.repository.PackRepository;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/**
 * Pack de textures Redstone Tweaks (Modrinth) : sens et état des blocs de redstone visibles.
 * Téléchargé dans resourcepacks/ et activé depuis l'écran Visuel, sans relancer le jeu.
 * L'interrupteur suit l'état réel du jeu (le pack peut aussi être retiré dans le menu des packs).
 */
public final class RedstonePack {
	private static final String PROJECT = "redstone-tweaks";
	/** Début du nom des fichiers téléchargés : sert à reconnaître le pack parmi ceux du jeu */
	private static final String FILE_PREFIX = "Redstone Tweaks ";

	public enum Status { IDLE, DOWNLOADING, FAILED, UNAVAILABLE }

	private static volatile Status status = Status.IDLE;

	private RedstonePack() {
	}

	public static Status status() {
		return status;
	}

	/** Le pack est activé dans le jeu */
	public static boolean active() {
		return !selectedIds(Minecraft.getInstance().getResourcePackRepository()).isEmpty();
	}

	public static void toggle() {
		if (status == Status.DOWNLOADING) return;
		if (active()) disable();
		else enable();
	}

	private static List<String> selectedIds(PackRepository repository) {
		List<String> ids = new ArrayList<>();
		for (String id : repository.getSelectedIds()) {
			if (id.startsWith("file/" + FILE_PREFIX)) ids.add(id);
		}
		return ids;
	}

	private static void disable() {
		Minecraft mc = Minecraft.getInstance();
		PackRepository repository = mc.getResourcePackRepository();
		for (String id : selectedIds(repository)) repository.removePack(id);
		mc.options.updateResourcePacks(repository);
		status = Status.IDLE;
	}

	private static void enable() {
		status = Status.DOWNLOADING;
		Thread thread = new Thread(() -> {
			try {
				String fileName = download();
				if (fileName == null) {
					status = Status.UNAVAILABLE;
					return;
				}
				Minecraft mc = Minecraft.getInstance();
				mc.execute(() -> {
					PackRepository repository = mc.getResourcePackRepository();
					repository.reload();
					if (repository.addPack("file/" + fileName)) {
						mc.options.updateResourcePacks(repository);
						status = Status.IDLE;
					} else {
						AloriaHud.LOGGER.warn("Pack {} introuvable après téléchargement", fileName);
						status = Status.FAILED;
					}
				});
			} catch (IOException | InterruptedException | RuntimeException e) {
				AloriaHud.LOGGER.warn("Téléchargement de Redstone Tweaks impossible", e);
				status = Status.FAILED;
			}
		}, "Aloria HUD - Redstone Tweaks");
		thread.setDaemon(true);
		thread.start();
	}

	/** Télécharge la version du pack faite pour ce jeu (si elle n'est pas déjà là) ; null si Modrinth n'en a pas */
	private static String download() throws IOException, InterruptedException {
		String game = FabricLoader.getInstance().getModContainer("minecraft")
			.map(c -> c.getMetadata().getVersion().getFriendlyString()).orElseThrow();
		HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).connectTimeout(Duration.ofSeconds(10)).build();
		String query = "game_versions=" + URLEncoder.encode("[\"" + game + "\"]", StandardCharsets.UTF_8)
			+ "&loaders=" + URLEncoder.encode("[\"minecraft\"]", StandardCharsets.UTF_8);
		HttpResponse<String> response = http.send(request("https://api.modrinth.com/v2/project/" + PROJECT + "/version?" + query),
			HttpResponse.BodyHandlers.ofString());
		if (response.statusCode() != 200) throw new IOException("Modrinth : code " + response.statusCode());
		JsonArray versions = JsonParser.parseString(response.body()).getAsJsonArray();
		if (versions.isEmpty()) return null;

		JsonObject version = versions.get(0).getAsJsonObject();
		JsonObject file = null;
		for (JsonElement f : version.getAsJsonArray("files")) {
			if (file == null || f.getAsJsonObject().get("primary").getAsBoolean()) file = f.getAsJsonObject();
		}
		if (file == null) return null;

		String fileName = FILE_PREFIX + version.get("version_number").getAsString().replaceAll("[^A-Za-z0-9._+-]", "_") + ".zip";
		Path packs = Minecraft.getInstance().gameDirectory.toPath().resolve("resourcepacks");
		Path target = packs.resolve(fileName);
		String sha1 = file.getAsJsonObject("hashes").get("sha1").getAsString();
		if (Files.isRegularFile(target) && sha1.equalsIgnoreCase(sha1(Files.readAllBytes(target)))) return fileName;

		HttpResponse<byte[]> data = http.send(request(file.get("url").getAsString()), HttpResponse.BodyHandlers.ofByteArray());
		if (data.statusCode() != 200) throw new IOException("Téléchargement : code " + data.statusCode());
		if (!sha1.equalsIgnoreCase(sha1(data.body()))) throw new IOException("Fichier abîmé (sha1 différent)");
		Files.createDirectories(packs);
		Path temp = packs.resolve(fileName + ".part");
		Files.write(temp, data.body());
		Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
		return fileName;
	}

	private static HttpRequest request(String url) {
		return HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(60))
			.header("User-Agent", "Alykell/Aloria-HUD (github.com/Alykell/Aloria)").build();
	}

	private static String sha1(byte[] bytes) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(bytes));
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
