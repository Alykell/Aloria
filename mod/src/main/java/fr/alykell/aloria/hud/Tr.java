package fr.alykell.aloria.hud;

import net.minecraft.client.resources.language.I18n;

/**
 * Textes du mod dans la langue du jeu (assets/aloriahud/lang : en_us.json, fr_fr.json ; l'anglais sert de secours).
 * Les clés sont écrites sans le préfixe « aloriahud. ». Paramètres : %s, et %% pour un « % ».
 */
public final class Tr {
	private Tr() {
	}

	public static String tr(String key, Object... args) {
		return I18n.get(AloriaHud.MOD_ID + "." + key, args);
	}
}
