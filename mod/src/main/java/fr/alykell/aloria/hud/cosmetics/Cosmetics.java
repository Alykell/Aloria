package fr.alykell.aloria.hud.cosmetics;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import fr.alykell.aloria.hud.AloriaHud;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.resources.Identifier;

/**
 * Cosmétiques d'Aloria portés par les joueurs (capes, chapeaux), demandés au Worker du launcher (dossier worker/) :
 * les joueurs croisés sont regroupés, une requête par seconde au plus, et ce qu'ils portent est gardé une minute.
 * Seuls les cosmétiques que cette version du mod sait dessiner sont gardés.
 */
public final class Cosmetics {
	private static final String API = "https://aloria-cosmetics.aloria-client.workers.dev/players?uuids=";
	private static final long TTL = 60_000;
	public static final Set<String> CAPES = Set.of("aloria_cape");
	public static final Set<String> HATS = Set.of("pumpkin_hat");

	private record Worn(String cape, String hat, long at) {}

	private static final Map<UUID, Worn> worn = new ConcurrentHashMap<>();
	private static final Set<UUID> wanted = ConcurrentHashMap.newKeySet();
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

	/** Texture d'un cosmétique : assets/aloriahud/textures/cosmetics/<id>.png */
	public static Identifier texture(String id) {
		return Identifier.fromNamespaceAndPath(AloriaHud.MOD_ID, "textures/cosmetics/" + id + ".png");
	}

	private static synchronized void start() {
		if (thread != null) return;
		thread = new Thread(Cosmetics::loop, "Aloria cosmetics");
		thread.setDaemon(true);
		thread.start();
	}

	private static void loop() {
		HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
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
					HttpResponse<String> response = http.send(
						HttpRequest.newBuilder(URI.create(API + ids)).timeout(Duration.ofSeconds(10)).GET().build(),
						HttpResponse.BodyHandlers.ofString()
					);
					if (response.statusCode() == 200) result = JsonParser.parseString(response.body()).getAsJsonObject();
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
