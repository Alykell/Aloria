package fr.alykell.aloria.hud.cosmetics;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import fr.alykell.aloria.hud.AloriaHud;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.imageio.ImageIO;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;

/**
 * Cosmétiques d'Aloria portés par les joueurs (capes, chapeaux), demandés au Worker du launcher (dossier worker/) :
 * même fonctionnement que mod/ (joueurs regroupés, une requête par seconde au plus, gardés une minute), en Java 8.
 */
public final class Cosmetics {
	private static final String API = "https://aloria-cosmetics.aloria-client.workers.dev/players?uuids=";
	private static final long TTL = 60_000;
	public static final Set<String> CAPES = new HashSet<>(Arrays.asList("aloria_cape"));
	public static final Set<String> HATS = new HashSet<>(Arrays.asList("pumpkin_hat"));

	private static final class Worn {
		final String cape;
		final String hat;
		final long at;

		Worn(String cape, String hat, long at) {
			this.cape = cape;
			this.hat = hat;
			this.at = at;
		}
	}

	private static final Map<UUID, Worn> worn = new ConcurrentHashMap<>();
	private static final Set<UUID> wanted = ConcurrentHashMap.newKeySet();
	private static final Map<String, Identifier> textures = new ConcurrentHashMap<>();
	private static Thread thread;

	private Cosmetics() {}

	private static Worn get(UUID id) {
		Worn w = worn.get(id);
		if (w == null || System.currentTimeMillis() - w.at > TTL) {
			wanted.add(id);
			start();
		}
		return w;
	}

	/** Chapeau porté (id du cosmétique), ou null */
	public static String hat(UUID id) {
		Worn w = get(id);
		return w == null ? null : w.hat;
	}

	/** Cape d'Aloria portée (id du cosmétique), ou null : celle du compte reste alors affichée */
	public static String cape(UUID id) {
		Worn w = get(id);
		return w == null ? null : w.cape;
	}

	/** Auto-test : ce joueur porte ces cosmétiques, sans demander au Worker */
	public static void wear(UUID id, String cape, String hat) {
		worn.put(id, new Worn(cape, hat, Long.MAX_VALUE / 2));
	}

	/**
	 * Texture d'un cosmétique (assets/aloriahud/textures/cosmetics/<id>.png), à appeler pendant le rendu. Legacy Fabric ne
	 * donne pas au jeu les images des mods : elle est lue dans le jar et enregistrée comme texture dynamique (Forge aussi).
	 */
	public static Identifier texture(String id) {
		return textures.computeIfAbsent(id, i -> {
			Identifier identifier = new Identifier(AloriaHud.MOD_ID, "textures/cosmetics/" + i + ".png");
			try (InputStream in = Cosmetics.class.getResourceAsStream("/assets/aloriahud/textures/cosmetics/" + i + ".png")) {
				BufferedImage image = ImageIO.read(in);
				MinecraftClient.getInstance().getTextureManager().loadTexture(identifier, new NativeImageBackedTexture(image));
			} catch (Exception e) {
				AloriaHud.LOGGER.warn("[cosmétiques] texture {} : {}", i, e.toString());
			}
			return identifier;
		});
	}

	private static synchronized void start() {
		if (thread != null) return;
		thread = new Thread(Cosmetics::loop, "Aloria cosmetics");
		thread.setDaemon(true);
		thread.start();
	}

	private static void loop() {
		while (true) {
			try {
				Thread.sleep(1000);
				if (wanted.isEmpty()) continue;
				List<UUID> batch = new ArrayList<>();
				for (Iterator<UUID> it = wanted.iterator(); it.hasNext() && batch.size() < 100; ) {
					batch.add(it.next());
					it.remove();
				}
				StringBuilder ids = new StringBuilder();
				for (UUID id : batch) ids.append(ids.length() == 0 ? "" : ",").append(id.toString().replace("-", ""));
				JsonObject result = new JsonObject();
				try {
					HttpURLConnection http = (HttpURLConnection) new URL(API + ids).openConnection();
					http.setConnectTimeout(10_000);
					http.setReadTimeout(10_000);
					if (http.getResponseCode() == 200) {
						try (Reader reader = new InputStreamReader(http.getInputStream(), StandardCharsets.UTF_8)) {
							result = new JsonParser().parse(reader).getAsJsonObject();
						}
					}
				} catch (Exception e) {
					// Pas de réseau : personne n'a de cosmétique, nouvel essai dans une minute
				}
				long now = System.currentTimeMillis();
				for (UUID id : batch) {
					JsonElement entry = result.get(id.toString().replace("-", ""));
					String cape = null;
					String hat = null;
					if (entry != null && entry.isJsonObject()) {
						cape = known(entry.getAsJsonObject().get("cape"), CAPES);
						hat = known(entry.getAsJsonObject().get("hat"), HATS);
					}
					worn.put(id, new Worn(cape, hat, now));
				}
			} catch (InterruptedException e) {
				return;
			} catch (Exception e) {
				AloriaHud.LOGGER.warn("[cosmétiques] {}", e.toString());
			}
		}
	}

	private static String known(JsonElement value, Set<String> ids) {
		if (value == null || !value.isJsonPrimitive()) return null;
		String id = value.getAsString();
		return ids.contains(id) ? id : null;
	}
}
