package fr.alykell.aloria.hud.screen;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.Visual;
import fr.alykell.aloria.hud.config.VisualSettings;
import fr.alykell.aloria.hud.config.VisualSettings.HandTransform;
import net.minecraft.client.gui.screen.Screen;

import java.util.Locale;

/**
 * Réglages d'un module de la catégorie Rendu en 1.8.9 : main tenue ou brouillard (mêmes réglages que le mod moderne, sans seconde
 * main, bouclier, totem ni neige poudreuse, absents de cette version), ouverts depuis le menu.
 * Petit panneau en haut de l'écran, sans assombrir le jeu, pour voir chaque réglage en direct.
 */
public class VisualScreen extends AloriaScreen {
	private static final String[][] TABS = {{"hands", "visual.tab.hands"}, {"fog", "visual.tab.fog"}};
	private static final int PAD = 8;
	private static final int ROW_H = 15;
	private static final int LABEL_W = 80;

	/** Valeur choisie avec un curseur, déjà arrondie au pas */
	private interface FloatSetter {
		void accept(float value);
	}

	private String tab = "hands";

	public VisualScreen(Screen parent, String section) {
		super(parent);
		this.tab = section;
		this.accent = Theme.CAT_RENDER;
	}

	/** Nom de la partie ouverte (titre du panneau) */
	public static String sectionName(String section) {
		for (String[] t : TABS) {
			if (t[0].equals(section)) return Tr.tr(t[1]);
		}
		return section;
	}

	/** Pour l'auto-test */
	public void openTab(String id) {
		tab = id;
	}

	private VisualSettings v() {
		return Visual.settings();
	}

	private int rows() {
		if (tab.equals("hands")) return 5;
		return 5;
	}

	@Override
	protected void background(G g, int mouseX, int mouseY) {
		// Rien : le jeu doit rester visible tel quel pour juger des réglages
	}

	@Override
	protected void draw(G g, int mouseX, int mouseY) {
		// Compact et en haut : la main (en bas) et le centre de l'écran restent visibles
		int w = Math.min(310, width - 16);
		int x = (width - w) / 2;
		int y = 4;
		int h = PAD + 16 + 8 + rows() * ROW_H + PAD - 2;
		round(g, x, y, w, h, Theme.UI_PANEL);
		roundOutline(g, x, y, w, h, Theme.UI_LINE);

		// Retour au menu, nom du module (pastille violette de la catégorie Rendu) et fermeture
		int tx = x + PAD;
		int ty = y + PAD;
		String back = Tr.tr("menu.back");
		int backW = w(back) + 12;
		buttonWithId("visual:back", g, mouseX, mouseY, tx, ty, backW, 16, back, false, this::onClose);
		round(g, tx + backW + 8, ty + 5, 6, 6, Theme.CAT_RENDER);
		text(g, bold(sectionName(tab)), tx + backW + 18, ty + 4, Theme.WHITE, false);
		button(g, mouseX, mouseY, x + w - PAD - 16, y + PAD, 16, 16, "✕", false, () -> client.setScreen(null));

		int oy = ty + 16 + 8;
		if (tab.equals("hands")) drawHand(g, mouseX, mouseY, x, oy, w);
		else drawFog(g, mouseX, mouseY, x, oy, w);
	}

	// ---------------------------------------------------------------- lignes communes

	/** Ligne « libellé, curseur, valeur » ; la valeur est arrondie au pas donné */
	private void sliderRow(G g, int mouseX, int mouseY, String id, String label, int x, int y, int w,
		float value, final float min, final float max, final float step, String display, final FloatSetter set) {
		text(g, label, x + PAD, y + 2, Theme.UI_TEXT, false);
		int sx = x + PAD + LABEL_W;
		int sw = w - PAD * 2 - LABEL_W - 44;
		slider(g, mouseX, mouseY, id, sx, y, sw, (value - min) / (max - min), t -> {
			float raw = min + t * (max - min);
			set.accept(Math.round(raw / step) * step);
		});
		text(g, display, x + w - PAD - 38, y + 2, Theme.CAT_RENDER, false);
	}

	private static String signed(float value) {
		return value == 0 ? Tr.tr("visual.normal") : String.format(Locale.ROOT, "%+.2f", value);
	}

	private static String times(float value) {
		return value == 1f ? Tr.tr("visual.normal") : String.format(Locale.ROOT, "×%.2f", value);
	}

	// ---------------------------------------------------------------- onglets

	/** La seule main de la 1.8.9 : quatre curseurs puis « Réinitialiser » */
	private void drawHand(G g, int mouseX, int mouseY, int x, int y, int w) {
		final HandTransform t = v().mainHand;
		sliderRow(g, mouseX, mouseY, "main:side", Tr.tr("visual.side"), x, y, w, t.side, -0.6f, 0.6f, 0.02f, signed(t.side), value -> t.side = value);
		y += ROW_H;
		sliderRow(g, mouseX, mouseY, "main:height", Tr.tr("visual.height"), x, y, w, t.height, -0.6f, 0.6f, 0.02f, signed(t.height), value -> t.height = value);
		y += ROW_H;
		sliderRow(g, mouseX, mouseY, "main:depth", Tr.tr("visual.depth"), x, y, w, t.depth, -0.4f, 0.8f, 0.02f, signed(t.depth), value -> t.depth = value);
		y += ROW_H;
		sliderRow(g, mouseX, mouseY, "main:scale", Tr.tr("edit.size"), x, y, w, t.scale, 0.3f, 1.5f, 0.05f, times(t.scale), value -> t.scale = value);
		y += ROW_H;
		String label = Tr.tr("menu.reset");
		buttonWithId("main:reset", g, mouseX, mouseY, x + PAD, y, w(label) + 16, 13, label, false, () -> v().mainHand = new HandTransform());
	}

	private void drawFog(G g, int mouseX, int mouseY, int x, int y, int w) {
		fogRow(g, mouseX, mouseY, "fog:overworld", "Overworld", x, y, w, v().fogOverworld, p -> v().fogOverworld = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:nether", "Nether", x, y, w, v().fogNether, p -> v().fogNether = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:end", "End", x, y, w, v().fogEnd, p -> v().fogEnd = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:water", Tr.tr("visual.fogWater"), x, y, w, v().fogWater, p -> v().fogWater = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:lava", Tr.tr("visual.fogLava"), x, y, w, v().fogLava, p -> v().fogLava = p);
	}

	/** Pourcentage de brouillard choisi */
	private interface PercentSetter {
		void accept(int percent);
	}

	private void fogRow(G g, int mouseX, int mouseY, String id, String label, int x, int y, int w, int value, final PercentSetter set) {
		String display = value >= 100 ? Tr.tr("visual.normal") : value <= 0 ? Tr.tr("visual.none") : Tr.tr("visual.percent", value);
		sliderRow(g, mouseX, mouseY, id, label, x, y, w, value, 0, 100, 5, display, f -> set.accept(Math.round(f)));
	}

	@Override
	public void removed() {
		AloriaHud.config().save();
	}
}
