package fr.alykell.aloria.hud;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Connexion automatique (/login) sur les serveurs cochés dans le launcher. Les mots de passe arrivent par la variable
 * d'environnement ALORIA_AUTOLOGIN ({"adresse:port": "mot de passe"}) : rien n'est écrit sur le disque. La commande part
 * directement au serveur, sans passer par le chat : elle n'apparaît ni à l'écran ni dans l'historique (flèches).
 * Elle ne part que si le serveur demande le /login : un serveur sans cette commande renverrait le mot de passe dans son
 * message d'erreur (« commande inconnue »).
 */
public final class AutoLogin {
	/** Le serveur demande le /login dans ce délai après l'arrivée (plus tard, ce n'est sans doute pas lui) */
	private static final long PROMPT_WINDOW_MS = 60_000;

	private static final Map<String, String> PASSWORDS = load();
	private static String pending;
	private static long joinedAt;

	private AutoLogin() {}

	private static Map<String, String> load() {
		Map<String, String> map = new HashMap<>();
		String raw = System.getenv("ALORIA_AUTOLOGIN");
		if (raw == null || raw.isEmpty()) return map;
		try {
			JsonObject json = JsonParser.parseString(raw).getAsJsonObject();
			for (String address : json.keySet()) map.put(key(address), json.get(address).getAsString());
		} catch (RuntimeException e) {
			AloriaHud.LOGGER.warn("Connexion automatique : liste illisible");
		}
		return map;
	}

	/** « Play.Exemple.fr » et « play.exemple.fr:25565 » désignent le même serveur */
	static String key(String address) {
		String a = address.trim().toLowerCase(Locale.ROOT);
		return a.matches(".*:\\d+$") ? a : a + ":25565";
	}

	public static void init() {
		if (PASSWORDS.isEmpty()) return;
		ClientPlayConnectionEvents.JOIN.register((handler, sender, mc) -> {
			ServerData server = mc.getCurrentServer();
			pending = server == null || mc.isLocalServer() ? null : PASSWORDS.get(key(server.ip));
			joinedAt = System.currentTimeMillis();
		});
		ClientPlayConnectionEvents.DISCONNECT.register((handler, mc) -> pending = null);
		// Messages du serveur (pas ceux des joueurs) : « Connecte-toi avec /login <mot de passe> »
		ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
			if (pending == null || System.currentTimeMillis() - joinedAt > PROMPT_WINDOW_MS) return;
			String text = message.getString().toLowerCase(Locale.ROOT);
			if (text.contains("/login") || text.contains("/l ")) {
				Minecraft mc = Minecraft.getInstance();
				mc.execute(() -> send(mc));
			}
		});
	}

	private static void send(Minecraft mc) {
		if (pending == null || mc.getConnection() == null) return;
		mc.getConnection().sendCommand("login " + pending);
		pending = null;
		AloriaHud.LOGGER.info("Connexion automatique envoyée");
	}
}
