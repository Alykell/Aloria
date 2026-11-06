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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

import org.jspecify.annotations.Nullable;

/**
 * Pack de textures Modrinth activable depuis la page « Packs de ressources » du menu, sans relancer le jeu :
 * téléchargé dans resourcepacks/ dans sa version pour ce jeu. L'interrupteur suit l'état réel du jeu (le pack peut
 * aussi être retiré dans le menu des packs).
 */
public final class ModrinthPack {
	/** Redstone Tweaks : sens et état des blocs de redstone visibles */
	public static final ModrinthPack REDSTONE = new ModrinthPack("redstone-tweaks", "Redstone Tweaks ", "redstone", 0xFFD82020);
	/** Enchant Icons : icône et couleur devant chaque enchantement (texte des objets), dans toutes les langues */
	public static final ModrinthPack ENCHANT_ICONS = new ModrinthPack("enchant-icons-countxd", "Enchant Icons ", "enchantIcons", 0xFFA070FF);
	/** NoBlockRotations : herbe, terre, sable, pierre… toujours dans le même sens (rotation aléatoire des textures retirée) */
	public static final ModrinthPack NO_ROTATION = new ModrinthPack("noblockrotations", "NoBlockRotations ", "noRotation", 0xFF7FB24F);

	/** Feu bas : fait par Aloria, en code (les flammes à l'écran descendent), sans rechargement des ressources */
	public static final ModrinthPack LOW_FIRE = new ModrinthPack(null, "", "lowFire", 0xFFFF8A1F, null,
		() -> Visual.settings().lowFire, on -> Visual.settings().lowFire = on);
	/** Sans particules d'explosion : fait par Aloria, écrit dans resourcepacks/ (textures d'explosion transparentes) */
	public static final ModrinthPack NO_EXPLOSION = new ModrinthPack(null, "Aloria Sans explosions", "noExplosion", 0xFFB8B8C8,
		AloriaPacks::writeNoExplosion, null, null);

	/** Tous les packs proposés, dans l'ordre de la page « Packs de ressources » */
	public static final List<ModrinthPack> ALL = List.of(REDSTONE, ENCHANT_ICONS, NO_ROTATION, LOW_FIRE, NO_EXPLOSION);

	/** Pack fait par Aloria : écrit en zip au lieu d'être téléchargé */
	public interface Generator {
		void write(Path zip) throws IOException;
	}

	public enum Status { IDLE, DOWNLOADING, FAILED, UNAVAILABLE }

	private final String project;
	/** Début du nom des fichiers téléchargés : sert à reconnaître le pack parmi ceux du jeu */
	private final String filePrefix;
	/** Identifiant court (zones cliquables, textes « visual.<id> » et « visual.<id>Hint ») */
	public final String id;
	/** Couleur de la vignette dans la liste */
	public final int color;
	private volatile Status status = Status.IDLE;

	private final @Nullable Generator generator;
	/** Pack « en code » (pas de fichier) : état lu et changé dans les réglages */
	private final @Nullable BooleanSupplier codeActive;
	private final @Nullable Consumer<Boolean> codeSet;

	private ModrinthPack(String project, String filePrefix, String id, int color) {
		this(project, filePrefix, id, color, null, null, null);
	}

	private ModrinthPack(@Nullable String project, String filePrefix, String id, int color, @Nullable Generator generator,
		@Nullable BooleanSupplier codeActive, @Nullable Consumer<Boolean> codeSet) {
		this.project = project;
		this.filePrefix = filePrefix;
		this.id = id;
		this.color = color;
		this.generator = generator;
		this.codeActive = codeActive;
		this.codeSet = codeSet;
	}

	/** Fait par Aloria (pas un pack Modrinth) */
	public boolean aloria() {
		return project == null;
	}

	public String project() {
		return project;
	}

	public Status status() {
		return status;
	}

	/** Le pack est activé dans le jeu */
	public boolean active() {
		if (codeActive != null) return codeActive.getAsBoolean();
		return !selectedIds(Minecraft.getInstance().getResourcePackRepository()).isEmpty();
	}

	public void toggle() {
		if (status == Status.DOWNLOADING) return;
		if (codeSet != null) {
			codeSet.accept(!active());
			return;
		}
		if (active()) disable();
		else enable();
	}

	private List<String> selectedIds(PackRepository repository) {
		List<String> ids = new ArrayList<>();
		for (String id : repository.getSelectedIds()) {
			if (id.startsWith("file/" + filePrefix)) ids.add(id);
		}
		return ids;
	}

	private void disable() {
		Minecraft mc = Minecraft.getInstance();
		PackRepository repository = mc.getResourcePackRepository();
		for (String id : selectedIds(repository)) repository.removePack(id);
		mc.options.updateResourcePacks(repository);
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
				AloriaHud.LOGGER.warn("Téléchargement du pack {} impossible", project, e);
				status = Status.FAILED;
			}
		}, "Aloria HUD - " + project);
		thread.setDaemon(true);
		thread.start();
	}

	/**
	 * Applique plusieurs changements d'un coup : télécharge ce qu'il faut, puis active et retire les packs
	 * et ne recharge les ressources du jeu qu'une fois (au lieu d'une fois par pack).
	 */
	public static void applyAll(Map<ModrinthPack, Boolean> wanted) {
		Map<ModrinthPack, Boolean> changes = new LinkedHashMap<>();
		wanted.forEach((pack, on) -> {
			if (pack.status == Status.DOWNLOADING || on == pack.active()) return;
			// Pack en code : appliqué tout de suite, rien à recharger
			if (pack.codeSet != null) pack.codeSet.accept(on);
			else changes.put(pack, on);
		});
		if (changes.isEmpty()) return;
		changes.forEach((pack, on) -> {
			if (on) pack.status = Status.DOWNLOADING;
		});
		Thread thread = new Thread(() -> {
			Map<ModrinthPack, String> files = new LinkedHashMap<>();
			changes.forEach((pack, on) -> {
				if (!on) return;
				try {
					String fileName = pack.download();
					if (fileName == null) pack.status = Status.UNAVAILABLE;
					else files.put(pack, fileName);
				} catch (IOException | InterruptedException | RuntimeException e) {
					AloriaHud.LOGGER.warn("Téléchargement du pack {} impossible", pack.project, e);
					pack.status = Status.FAILED;
				}
			});
			Minecraft mc = Minecraft.getInstance();
			mc.execute(() -> {
				PackRepository repository = mc.getResourcePackRepository();
				if (!files.isEmpty()) repository.reload();
				changes.forEach((pack, on) -> {
					if (!on) {
						for (String id : pack.selectedIds(repository)) repository.removePack(id);
						pack.status = Status.IDLE;
					}
				});
				files.forEach((pack, fileName) -> {
					if (repository.addPack("file/" + fileName)) pack.status = Status.IDLE;
					else {
						AloriaHud.LOGGER.warn("Pack {} introuvable après téléchargement", fileName);
						pack.status = Status.FAILED;
					}
				});
				mc.options.updateResourcePacks(repository);
			});
		}, "Aloria HUD - packs");
		thread.setDaemon(true);
		thread.start();
	}

	/** Télécharge la version du pack faite pour ce jeu (si elle n'est pas déjà là) ; null si Modrinth n'en a pas */
	private String download() throws IOException, InterruptedException {
		if (generator != null) {
			// Pack d'Aloria : réécrit à chaque activation (quelques Ko), toujours à jour
			Path packs = Minecraft.getInstance().gameDirectory.toPath().resolve("resourcepacks");
			Files.createDirectories(packs);
			String fileName = filePrefix + ".zip";
			Path temp = packs.resolve(fileName + ".part");
			generator.write(temp);
			Files.move(temp, packs.resolve(fileName), StandardCopyOption.REPLACE_EXISTING);
			return fileName;
		}
		String game = FabricLoader.getInstance().getModContainer("minecraft")
			.map(c -> c.getMetadata().getVersion().getFriendlyString()).orElseThrow();
		HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).connectTimeout(Duration.ofSeconds(10)).build();
		String query = "game_versions=" + URLEncoder.encode("[\"" + game + "\"]", StandardCharsets.UTF_8)
			+ "&loaders=" + URLEncoder.encode("[\"minecraft\"]", StandardCharsets.UTF_8);
		HttpResponse<String> response = http.send(request("https://api.modrinth.com/v2/project/" + project + "/version?" + query),
			HttpResponse.BodyHandlers.ofString());
		if (response.statusCode() != 200) throw new IOException("Modrinth : code " + response.statusCode());
		JsonArray versions = JsonParser.parseString(response.body()).getAsJsonArray();
		if (versions.isEmpty()) versions = sameSeries(http, game);
		if (versions.isEmpty()) return null;

		JsonObject version = versions.get(0).getAsJsonObject();
		JsonObject file = null;
		for (JsonElement f : version.getAsJsonArray("files")) {
			if (file == null || f.getAsJsonObject().get("primary").getAsBoolean()) file = f.getAsJsonObject();
		}
		if (file == null) return null;

		String fileName = filePrefix + version.get("version_number").getAsString().replaceAll("[^A-Za-z0-9._+-]", "_") + ".zip";
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

	/**
	 * Pas encore de version du pack pour ce jeu (sortie récente) : la plus récente faite pour la même série
	 * (26.2 pour la 26.3, 1.21.10 pour la 1.21.11). Le jeu la signale « faite pour une version antérieure », sans gêne.
	 */
	private JsonArray sameSeries(HttpClient http, String game) throws IOException, InterruptedException {
		String[] parts = game.split("\\.");
		String series = (parts[0].equals("1") && parts.length > 1 ? parts[0] + "." + parts[1] : parts[0]) + ".";
		HttpResponse<String> response = http.send(request("https://api.modrinth.com/v2/project/" + project + "/version?loaders="
			+ URLEncoder.encode("[\"minecraft\"]", StandardCharsets.UTF_8)), HttpResponse.BodyHandlers.ofString());
		JsonArray matching = new JsonArray();
		if (response.statusCode() != 200) return matching;
		// Modrinth les donne de la plus récente à la plus ancienne
		for (JsonElement v : JsonParser.parseString(response.body()).getAsJsonArray()) {
			for (JsonElement gv : v.getAsJsonObject().getAsJsonArray("game_versions")) {
				if (gv.getAsString().startsWith(series)) {
					matching.add(v);
					return matching;
				}
			}
		}
		return matching;
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
