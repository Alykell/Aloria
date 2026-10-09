package fr.alykell.aloria.hud.screen;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.Visual;
import fr.alykell.aloria.hud.config.VisualSettings;
import fr.alykell.aloria.hud.config.VisualSettings.HandTransform;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.IntConsumer;

/**
 * Écran Visuel : mains, bouclier, totem, luminosité et brouillard.
 * Petit panneau en haut de l'écran, sans assombrir le jeu, pour voir chaque réglage en direct.
 */
public class VisualScreen extends AloriaScreen {
	private static final String[][] TABS = {
		{"hands", "visual.tab.hands"}, {"shield", "visual.tab.shield"}, {"totem", "visual.tab.totem"}, {"light", "visual.tab.light"}, {"fog", "visual.tab.fog"}
	};
	private static final int PAD = 8;
	private static final int ROW_H = 15;
	private static final int LABEL_W = 80;

	private String tab = "hands";
	/** Onglet Mains : main principale ou secondaire */
	private boolean offHand;

	public VisualScreen(@Nullable Screen parent) {
		super(Component.literal(Tr.tr("visual.title")), parent);
	}

	/** Pour l'auto-test */
	public void openTab(String id) {
		tab = id;
	}

	private VisualSettings v() {
		return Visual.settings();
	}

	private int rows() {
		return switch (tab) {
			case "hands" -> 6;
			case "shield" -> 6;
			case "totem" -> 3;
			case "light" -> 2;
			default -> 6;
		};
	}

	@Override
	protected void background(GuiGraphicsExtractor g, int mouseX, int mouseY) {
		// Rien : le jeu doit rester visible tel quel pour juger des réglages
	}

	@Override
	protected void draw(GuiGraphicsExtractor g, int mouseX, int mouseY) {
		// Compact et en haut : les mains (en bas) et le centre de l'écran restent visibles
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
			String id = t[0];
			onClick("vtab:" + id, tx, ty, tw, 16, () -> tab = id);
			tx += tw + 3;
		}

		int oy = ty + 16 + 8;
		switch (tab) {
			case "hands" -> drawHands(g, mouseX, mouseY, x, oy, w);
			case "shield" -> drawShield(g, mouseX, mouseY, x, oy, w);
			case "totem" -> drawTotem(g, mouseX, mouseY, x, oy, w);
			case "light" -> drawLight(g, x, oy, w);
			default -> drawFog(g, mouseX, mouseY, x, oy, w);
		}
	}

	// ---------------------------------------------------------------- lignes communes

	/** Ligne « libellé, curseur, valeur » ; la valeur est arrondie au pas donné */
	private void sliderRow(GuiGraphicsExtractor g, int mouseX, int mouseY, String id, String label, int x, int y, int w,
		float value, float min, float max, float step, String display, Consumer<Float> set) {
		text(g, label, x + PAD, y + 2, Theme.FOAM, false);
		int sx = x + PAD + LABEL_W;
		int sw = w - PAD * 2 - LABEL_W - 44;
		slider(g, mouseX, mouseY, id, sx, y, sw, (value - min) / (max - min), t -> {
			float raw = (float) (min + t * (max - min));
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

	/** Les quatre curseurs d'un objet tenu, puis « Réinitialiser » */
	private int transformRows(GuiGraphicsExtractor g, int mouseX, int mouseY, String id, HandTransform t, int x, int y, int w, Runnable reset) {
		sliderRow(g, mouseX, mouseY, id + ":side", Tr.tr("visual.side"), x, y, w, t.side, -0.6f, 0.6f, 0.02f, signed(t.side), v -> t.side = v);
		y += ROW_H;
		sliderRow(g, mouseX, mouseY, id + ":height", Tr.tr("visual.height"), x, y, w, t.height, -0.6f, 0.6f, 0.02f, signed(t.height), v -> t.height = v);
		y += ROW_H;
		sliderRow(g, mouseX, mouseY, id + ":depth", Tr.tr("visual.depth"), x, y, w, t.depth, -0.4f, 0.8f, 0.02f, signed(t.depth), v -> t.depth = v);
		y += ROW_H;
		sliderRow(g, mouseX, mouseY, id + ":scale", Tr.tr("edit.size"), x, y, w, t.scale, 0.3f, 1.5f, 0.05f, times(t.scale), v -> t.scale = v);
		y += ROW_H;
		String label = Tr.tr("menu.reset");
		buttonWithId(id + ":reset", g, mouseX, mouseY, x + PAD, y, w(label) + 16, 13, label, false, reset);
		return y;
	}

	// ---------------------------------------------------------------- onglets

	private void drawHands(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w) {
		int half = (w - PAD * 2 - 4) / 2;
		choice(g, mouseX, mouseY, "hand:main", Tr.tr("visual.mainHand"), x + PAD, y, half, !offHand, () -> offHand = false);
		choice(g, mouseX, mouseY, "hand:off", Tr.tr("visual.offHand"), x + PAD + half + 4, y, half, offHand, () -> offHand = true);
		y += ROW_H;
		if (offHand) transformRows(g, mouseX, mouseY, "off", v().offHand, x, y, w, () -> v().offHand = new HandTransform());
		else transformRows(g, mouseX, mouseY, "main", v().mainHand, x, y, w, () -> v().mainHand = new HandTransform());
	}

	private void drawShield(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w) {
		text(g, Tr.tr("visual.shieldHint"), x + PAD, y + 2, Theme.TEXT_SOFT, false);
		y += ROW_H;
		transformRows(g, mouseX, mouseY, "shield", v().shield, x, y, w, () -> v().shield = new HandTransform());
	}

	private void drawTotem(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w) {
		text(g, Tr.tr("visual.totemHint"), x + PAD, y + 2, Theme.TEXT_SOFT, false);
		y += ROW_H;
		float scale = v().totemScale;
		sliderRow(g, mouseX, mouseY, "totem", Tr.tr("edit.size"), x, y, w, scale, 0.1f, 1f, 0.05f, times(scale), s -> v().totemScale = s);
		y += ROW_H;
		String preview = Tr.tr("visual.preview");
		button(g, mouseX, mouseY, x + PAD, y, w(preview) + 16, 13, preview, true, Visual::previewTotem);
		String reset = Tr.tr("menu.reset");
		buttonWithId("totem:reset", g, mouseX, mouseY, x + PAD + w(preview) + 22, y, w(reset) + 16, 13, reset, false, () -> v().totemScale = 1f);
	}

	private void drawLight(GuiGraphicsExtractor g, int x, int y, int w) {
		text(g, Tr.tr("visual.fullbright"), x + PAD, y + 2, Theme.FOAM, false);
		toggle("fullbright", g, x + w - PAD - 24, y + 1, v().fullbright, () -> v().fullbright = !v().fullbright);
		y += ROW_H;
		text(g, Tr.tr("visual.fullbrightHint"), x + PAD, y + 2, Theme.TEXT_SOFT, false);
	}

	private void drawFog(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w) {
		fogRow(g, mouseX, mouseY, "fog:overworld", "Overworld", x, y, w, v().fogOverworld, p -> v().fogOverworld = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:nether", "Nether", x, y, w, v().fogNether, p -> v().fogNether = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:end", "End", x, y, w, v().fogEnd, p -> v().fogEnd = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:water", Tr.tr("visual.fogWater"), x, y, w, v().fogWater, p -> v().fogWater = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:lava", Tr.tr("visual.fogLava"), x, y, w, v().fogLava, p -> v().fogLava = p);
		y += ROW_H;
		fogRow(g, mouseX, mouseY, "fog:snow", Tr.tr("visual.fogSnow"), x, y, w, v().fogSnow, p -> v().fogSnow = p);
	}

	private void fogRow(GuiGraphicsExtractor g, int mouseX, int mouseY, String id, String label, int x, int y, int w, int value, IntConsumer set) {
		String display = value >= 100 ? Tr.tr("visual.normal") : value <= 0 ? Tr.tr("visual.none") : Tr.tr("visual.percent", value);
		sliderRow(g, mouseX, mouseY, id, label, x, y, w, value, 0, 100, 5, display, f -> set.accept(Math.round(f)));
	}

	/** Bouton à deux états (choix exclusif) */
	private void choice(GuiGraphicsExtractor g, int mouseX, int mouseY, String id, String label, int x, int y, int w, boolean active, Runnable action) {
		boolean hover = hovered(mouseX, mouseY, x, y, w, 13);
		round(g, x, y, w, 13, active ? Theme.SEA : hover ? Theme.CARD_HOVER : Theme.CARD);
		centered(g, label, x + w / 2, y + 3, active ? Theme.WHITE : Theme.FOAM);
		onClick(id, x, y, w, 13, action);
	}

	@Override
	public void removed() {
		AloriaHud.config().save();
	}
}
