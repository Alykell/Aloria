package fr.alykell.aloria.hud;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Réglages des versions récentes que la 1.8.9 n'a pas : FOV dynamique, accroupi / course en bascule, entrée brute.
 * Ils vivent dans options.txt sous leur nom moderne : le launcher les y écrit depuis le jeu de réglages commun et les
 * récupère à la fermeture, comme les autres. La 1.8.9 les ignorerait et les effacerait : GameOptionsMixin les relit
 * au chargement et les réécrit à chaque enregistrement.
 */
public final class LegacyOptions {
	/** Effets de champ de vision (course, potion de vitesse, arc) : 0 = aucun, 1 = normal */
	public static float fovEffectScale = 1f;
	public static boolean toggleCrouch = false;
	public static boolean toggleSprint = false;
	/** Souris lue directement (sans l'accélération ni la vitesse du pointeur de Windows), comme en 1.13+ */
	public static boolean rawMouseInput = true;

	private static final List<String> KEYS = Arrays.asList("fovEffectScale", "toggleCrouch", "toggleSprint", "rawMouseInput");

	private LegacyOptions() {
	}

	public static void load(File file) {
		if (file == null || !file.exists()) return;
		try {
			for (String line : Files.readAllLines(file.toPath(), StandardCharsets.UTF_8)) {
				int i = line.indexOf(':');
				if (i <= 0) continue;
				String key = line.substring(0, i);
				String value = line.substring(i + 1).trim();
				try {
					switch (key) {
						case "fovEffectScale": fovEffectScale = Math.max(0, Math.min(1, Float.parseFloat(value))); break;
						case "toggleCrouch": toggleCrouch = Boolean.parseBoolean(value); break;
						case "toggleSprint": toggleSprint = Boolean.parseBoolean(value); break;
						case "rawMouseInput": rawMouseInput = Boolean.parseBoolean(value); break;
						default: break;
					}
				} catch (NumberFormatException ignored) {
					// Valeur illisible : on garde la précédente
				}
			}
		} catch (IOException e) {
			AloriaHud.LOGGER.warn("options.txt illisible", e);
		}
	}

	/** Ajoute nos réglages à la fin d'options.txt, juste après l'enregistrement du jeu */
	public static void append(File file) {
		if (file == null) return;
		StringBuilder out = new StringBuilder();
		out.append("fovEffectScale:").append(String.format(Locale.ROOT, "%s", fovEffectScale)).append('\n');
		out.append("toggleCrouch:").append(toggleCrouch).append('\n');
		out.append("toggleSprint:").append(toggleSprint).append('\n');
		out.append("rawMouseInput:").append(rawMouseInput).append('\n');
		try {
			Files.write(file.toPath(), out.toString().getBytes(StandardCharsets.UTF_8), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
		} catch (IOException e) {
			AloriaHud.LOGGER.warn("Impossible d'écrire dans options.txt", e);
		}
	}

	public static boolean isOurKey(String key) {
		return KEYS.contains(key);
	}
}
