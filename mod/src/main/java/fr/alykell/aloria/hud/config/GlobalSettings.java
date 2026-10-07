package fr.alykell.aloria.hud.config;

import java.util.ArrayList;
import java.util.List;

/** Réglages communs à tout le HUD. */
public class GlobalSettings {
	/** Police des menus Aloria (voir Fonts.CHOICES) */
	public String menuFont = "nunito";
	/** Même couleur de texte pour tous les modules (sauf ceux au style indépendant) */
	public boolean sameTextColor = false;
	public int textColor = 0xFF5CC8E0;
	/** Dernières couleurs choisies dans le sélecteur (ARGB), la plus récente en premier */
	public List<Integer> recentColors = new ArrayList<>();

	public void addRecentColor(int argb) {
		if (recentColors == null) recentColors = new ArrayList<>();
		recentColors.remove(Integer.valueOf(argb));
		recentColors.add(0, argb);
		while (recentColors.size() > 8) recentColors.remove(recentColors.size() - 1);
	}
}
