package fr.alykell.aloria.hud;

import net.minecraft.client.MinecraftClient;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.IllegalFormatException;
import java.util.Map;

/**
 * Textes du mod dans la langue du jeu. Les fichiers .lang sont produits à la construction depuis les fichiers JSON
 * du mod moderne (mod/src/main/resources/assets/aloriahud/lang) : mêmes clés, sans le préfixe « aloriahud. ».
 * Sans Fabric API, le jeu ne charge pas les traductions du mod : on les lit nous-mêmes (l'anglais sert de secours).
 * Paramètres : %s, et %% pour un « % ».
 */
public final class Tr {
	private static final String PREFIX = AloriaHud.MOD_ID + ".";
	private static String loaded;
	private static Map<String, String> current = new HashMap<>();
	private static Map<String, String> english;

	private Tr() {
	}

	public static String tr(String key, Object... args) {
		String lang = MinecraftClient.getInstance().options.language;
		if (!lang.equals(loaded)) {
			current = read(lang);
			loaded = lang;
		}
		if (english == null) english = read("en_US");
		String text = current.get(key);
		if (text == null) text = english.get(key);
		if (text == null) return PREFIX + key;
		if (args.length == 0) return text.replace("%%", "%");
		try {
			return String.format(text, args);
		} catch (IllegalFormatException e) {
			return text;
		}
	}

	private static Map<String, String> read(String lang) {
		Map<String, String> map = new HashMap<>();
		try (InputStream in = Tr.class.getResourceAsStream("/assets/aloriahud/lang/" + lang + ".lang")) {
			if (in == null) return map;
			BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
			String line;
			while ((line = reader.readLine()) != null) {
				int eq = line.indexOf('=');
				if (eq > 0 && line.startsWith(PREFIX)) map.put(line.substring(PREFIX.length(), eq), line.substring(eq + 1));
			}
		} catch (IOException e) {
			AloriaHud.LOGGER.warn("Traductions illisibles ({})", lang, e);
		}
		return map;
	}
}
