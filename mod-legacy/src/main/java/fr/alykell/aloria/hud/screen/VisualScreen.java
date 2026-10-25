package fr.alykell.aloria.hud.screen;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.ModrinthPack;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.Visual;
import fr.alykell.aloria.hud.config.VisualSettings;
import fr.alykell.aloria.hud.config.VisualSettings.HandTransform;
import net.minecraft.client.gui.screen.Screen;

import java.util.Locale;

/**
 * Écran Visuel de la 1.8.9 : main tenue, luminosité, blocs sans rotation et brouillard (mêmes réglages que le mod moderne, sans seconde
 * main, bouclier, totem ni neige poudreuse, absents de cette version).
 * Petit panneau en haut de l'écran, sans assombrir le jeu, pour voir chaque réglage en direct.
 */
public class VisualScreen extends AloriaScreen {
	private static final String[][] TABS = {{"hands", "visual.tab.hands"}, {"light", "visual.tab.light"}, {"fog", "visual.tab.fog"}};
	private static final int PAD = 8;
	private static final int ROW_H = 15;
	private static final int LABEL_W = 80;

	/** Valeur choisie avec un curseur, déjà arrondie au pas */
	private interface FloatSetter {
		void accept(float value);
	}

	private String tab = "hands";

	public VisualScreen(Screen parent) {
		super(parent);
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
		if (tab.equals("light")) return 6;
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
		round(g, x, y, w, h, Theme.WINDOW);
		roundOutline(g, x, y, w, h, Theme.BORDER);

		button(g, mouseX, mouseY, x + w - PAD - 16, y + PAD, 16, 16, "✕", false, this::onClose);

		// Onglets
		int tx = x + PAD;
		int ty = y + PAD;
		for (String[] t : TABS) {
			String name = Tr.tr(t[1]);
			int tw = w(name) + 10;
			boolean active = tab.equals(t[0]);
			boolean hover = hovered(mouseX, mouseY, tx, ty, tw, 16);
			round(g, tx, ty, tw, 16, active ? Theme.SEA : hover ? Theme.CARD_HOVER : Theme.CARD);
			centered(g, name, tx + tw / 2, ty + 4, active ? Theme.WHITE : Theme.FOAM);
			final String id = t[0];
			onClick("vtab:" + id, tx, ty, tw, 16, () -> tab = id);
			tx += tw + 3;
		}

		int oy = ty + 16 + 8;
		if (tab.equals("hands")) drawHand(g, mouseX, mouseY, x, oy, w);
		else if (tab.equals("light")) drawLight(g, x, oy, w);
		else drawFog(g, mouseX, mouseY, x, oy, w);
	}

	// ---------------------------------------------------------------- lignes communes

	/** Ligne « libellé, curseur, valeur » ; la valeur est arrondie au pas donné */
	private void sliderRow(G g, int mouseX, int mouseY, String id, String label, int x, int y, int w,
		float value, final float min, final float max, final float step, String display, final FloatSetter set) {
		text(g, label, x + PAD, y + 2, Theme.FOAM, false);
		int sx = x + PAD + LABEL_W;
		int sw = w - PAD * 2 - LABEL_W - 44;
		slider(g, mouseX, mouseY, id, sx, y, sw, (value - min) / (max - min), t -> {
			float raw = min + t * (max - min);
			set.accept(Math.round(raw / step) * step);
		});
		text(g, display, x + w - PAD - 38, y + 2, Theme.LAGOON, false);
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

	private void drawLight(G g, int x, int y, int w) {
		text(g, Tr.tr("visual.fullbright"), x + PAD, y + 2, Theme.FOAM, false);
		toggle("fullbright", g, x + w - PAD - 24, y + 1, v().fullbright, () -> v().fullbright = !v().fullbright);
		y += ROW_H;
		text(g, Tr.tr("visual.fullbrightHint"), x + PAD, y + 2, Theme.TEXT_SOFT, false);
		y += ROW_H;
		text(g, Tr.tr("visual.hidePumpkin"), x + PAD, y + 2, Theme.FOAM, false);
		toggle("hidePumpkin", g, x + w - PAD - 24, y + 1, v().hidePumpkin, () -> v().hidePumpkin = !v().hidePumpkin);
		y += ROW_H;
		text(g, Tr.tr("visual.hidePumpkinHint"), x + PAD, y + 2, Theme.TEXT_SOFT, false);
		y += ROW_H;
		packRow(g, x, y, w, ModrinthPack.NO_ROTATION, "noRotationPack", "visual.noRotation", "visual.noRotationHint");
	}

	/** Pack Modrinth en un clic : nom et interrupteur, puis l'explication ou l'état du téléchargement */
	private void packRow(G g, int x, int y, int w, ModrinthPack pack, String id, String label, String hintKey) {
		text(g, Tr.tr(label), x + PAD, y + 2, Theme.FOAM, false);
		toggle(id, g, x + w - PAD - 24, y + 1, pack.active(), pack::toggle);
		y += ROW_H;
		String hint;
		switch (pack.status()) {
			case DOWNLOADING: hint = Tr.tr("visual.redstone.downloading"); break;
			case FAILED: hint = Tr.tr("visual.redstone.failed"); break;
			case UNAVAILABLE: hint = Tr.tr("visual.redstone.unavailable"); break;
			default: hint = Tr.tr(hintKey);
		}
		text(g, hint, x + PAD, y + 2, pack.status() == ModrinthPack.Status.FAILED ? Theme.CORAL : Theme.TEXT_SOFT, false);
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
