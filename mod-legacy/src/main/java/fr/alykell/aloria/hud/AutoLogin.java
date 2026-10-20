package fr.alykell.aloria.hud;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ServerInfo;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Connexion automatique (/login) sur les serveurs cochés dans le launcher, comme le mod moderne : mots de passe dans la
 * variable d'environnement ALORIA_AUTOLOGIN, commande envoyée sans passer par le chat (ni affichée, ni dans l'historique),
 * seulement quand le serveur demande le /login.
 * Messages du serveur : ChatMixin ; arrivée sur un serveur : repérée au tick (pas de Fabric API en 1.8.9).
 */
public final class AutoLogin {
	private static final long PROMPT_WINDOW_MS = 60_000;

	private static final Map<String, String> PASSWORDS = load();
	private static String pending;
	private static long joinedAt;
	private static boolean inWorld;

	private AutoLogin() {}

	private static Map<String, String> load() {
		Map<String, String> map = new HashMap<String, String>();
		String raw = System.getenv("ALORIA_AUTOLOGIN");
		if (raw == null || raw.isEmpty()) return map;
		try {
			// Gson de la 1.8.9 : ni JsonParser.parseString ni keySet
			JsonObject json = new JsonParser().parse(raw).getAsJsonObject();
			for (Map.Entry<String, JsonElement> e : json.entrySet()) map.put(key(e.getKey()), e.getValue().getAsString());
		} catch (RuntimeException e) {
			AloriaHud.LOGGER.warn("Connexion automatique : liste illisible");
		}
		return map;
	}

	static String key(String address) {
		String a = address.trim().toLowerCase(Locale.ROOT);
		return a.matches(".*:\\d+$") ? a : a + ":25565";
	}

	/** Fin de chaque tick : arrivée sur un serveur */
	public static void tick(MinecraftClient mc) {
		if (PASSWORDS.isEmpty()) return;
		boolean now = mc.world != null;
		if (now && !inWorld) {
			ServerInfo server = mc.getCurrentServerEntry();
			pending = server == null || mc.isIntegratedServerRunning() ? null : PASSWORDS.get(key(server.address));
			joinedAt = System.currentTimeMillis();
		} else if (!now) {
			pending = null;
		}
		inWorld = now;
	}

	/** Message du serveur (ChatMixin, fil principal du jeu) */
	public static void onMessage(String message) {
		if (pending == null || System.currentTimeMillis() - joinedAt > PROMPT_WINDOW_MS) return;
		String text = message.toLowerCase(Locale.ROOT);
		if (text.contains("/login") || text.contains("/l ")) send(MinecraftClient.getInstance());
	}

	private static void send(MinecraftClient mc) {
		if (pending == null || mc.player == null) return;
		// En 1.8.9 une commande est un message qui commence par « / » ; seul l'écran de chat l'ajoute à l'historique
		mc.player.sendChatMessage("/login " + pending);
		pending = null;
		AloriaHud.LOGGER.info("Connexion automatique envoyée");
	}
}
