package fr.alykell.aloria.hud.screen;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.HudRenderer;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

import java.util.List;

/** Menu des modules, façon Lunar : une carte par module avec aperçu, réglages et activation. */
public class HudMenuScreen extends AloriaScreen {
	private static final String[][] TABS = {{"all", "Tous"}, {"info", "Infos"}, {"pvp", "PvP"}};
	private static final int COLUMNS = 4;
	private static final int GAP = 8;
	private static final int PAD = 12;
	private static final int CARD_H = 96;

	private String tab = "all";
	private @Nullable HudModule editing;
	private boolean draggingSlider;
	private int scroll;

	public HudMenuScreen(@Nullable Screen parent) {
		super(Component.literal("Aloria HUD"), parent);
	}

	/** Ouvre directement les réglages d'un module (clic droit dans l'éditeur de disposition) */
	public HudMenuScreen(@Nullable Screen parent, HudModule module) {
		this(parent);
		this.editing = module;
	}

	public @Nullable Screen parentScreen() {
		return parent;
	}

	private ModuleSettings settings(HudModule m) {
		return AloriaHud.config().get(m);
	}

	// Fenêtre centrale
	private int winW() {
		return Math.min(560, width - 40);
	}

	private int winH() {
		return Math.min(300, height - 80);
	}

	private int winX() {
		return (width - winW()) / 2;
	}

	private int winY() {
		return (height - winH()) / 2 + 14;
	}

	private List<HudModule> visibleModules() {
		return AloriaHud.modules().stream().filter(m -> tab.equals("all") || m.category().equals(tab)).toList();
	}

	@Override
	protected void draw(GuiGraphicsExtractor g, int mouseX, int mouseY) {
		int x = winX();
		int y = winY();
		int w = winW();
		int h = winH();

		// En-tête au-dessus de la fenêtre : titre à gauche, actions à droite
		g.text(font, bold("✦ ALORIA HUD"), x + 2, y - 22, Theme.WHITE, true);
		button(g, mouseX, mouseY, x + w - 22, y - 26, 22, 18, "✕", false, () -> minecraft.gui.setScreen(parent));
		button(g, mouseX, mouseY, x + w - 126, y - 26, 100, 18, "✥ Disposition", true,
			() -> minecraft.gui.setScreen(new HudLayoutScreen(this)));

		round(g, x, y, w, h, Theme.WINDOW);
		roundOutline(g, x, y, w, h, Theme.BORDER);

		if (editing != null) drawSettings(g, mouseX, mouseY, x, y, w, h, editing);
		else drawGrid(g, mouseX, mouseY, x, y, w, h);
	}

	// ---------------------------------------------------------------- grille des modules

	private void drawGrid(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, int h) {
		int tx = x + PAD;
		for (String[] t : TABS) {
			int tw = font.width(t[1]) + 22;
			boolean active = tab.equals(t[0]);
			boolean hover = hovered(mouseX, mouseY, tx, y + PAD, tw, 18);
			round(g, tx, y + PAD, tw, 18, active ? Theme.SEA : hover ? Theme.CARD_HOVER : Theme.CARD);
			g.centeredText(font, t[1], tx + tw / 2, y + PAD + 5, active ? Theme.WHITE : Theme.FOAM);
			String id = t[0];
			onClick("tab:" + id, tx, y + PAD, tw, 18, () -> {
				tab = id;
				scroll = 0;
			});
			tx += tw + 6;
		}

		int top = y + PAD + 18 + 10;
		int bottom = y + h - PAD;
		int cardW = (w - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
		List<HudModule> modules = visibleModules();

		g.enableScissor(x + 1, top, x + w - 1, bottom);
		for (int i = 0; i < modules.size(); i++) {
			int cx = x + PAD + (i % COLUMNS) * (cardW + GAP);
			int cy = top + (i / COLUMNS) * (CARD_H + GAP) - scroll;
			if (cy + CARD_H < top || cy > bottom) continue;
			drawCard(g, mouseX, mouseY, cx, cy, cardW, modules.get(i), top, bottom);
		}
		g.disableScissor();
	}

	private int maxScroll() {
		int rows = (visibleModules().size() + COLUMNS - 1) / COLUMNS;
		int content = rows * (CARD_H + GAP) - GAP;
		int view = winH() - PAD * 2 - 28;
		return Math.max(0, content - view);
	}

	/** Zone cliquable limitée à la partie visible de la grille (les cartes défilent) */
	private void clippedClick(String id, int x, int y, int w, int h, int top, int bottom, Runnable action) {
		int y0 = Math.max(y, top);
		int y1 = Math.min(y + h, bottom);
		if (y1 > y0) onClick(id, x, y0, w, y1 - y0, action);
	}

	private void drawCard(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, HudModule module, int top, int bottom) {
		ModuleSettings s = settings(module);
		// Survol seulement si la souris est dans la zone visible de la grille
		boolean clickable = mouseY >= top && mouseY < bottom;
		boolean hover = clickable && hovered(mouseX, mouseY, x, y, w, CARD_H);
		round(g, x, y, w, CARD_H, s.enabled ? (hover ? Theme.CARD_HOVER : Theme.CARD) : Theme.CARD_OFF);
		roundOutline(g, x, y, w, CARD_H, hover ? Theme.BORDER_HOVER : Theme.BORDER);
		g.text(font, bold(module.name()), x + 8, y + 8, s.enabled ? Theme.WHITE : Theme.TEXT_SOFT, false);

		// Aperçu réel du module, réduit pour tenir dans la carte
		int areaY = y + 22;
		int areaH = CARD_H - 22 - 30;
		drawPreview(g, module, s, x + 6, areaY, w - 12, areaH);

		int by = y + CARD_H - 24;
		boolean gearHover = clickable && hovered(mouseX, mouseY, x + 8, by, 18, 18);
		round(g, x + 8, by, 18, 18, gearHover ? Theme.CARD_HOVER : 0xFF0B2130);
		g.centeredText(font, "⚙", x + 17, by + 5, gearHover ? Theme.LAGOON : Theme.FOAM);
		clippedClick("gear:" + module.id(), x + 8, by, 18, 18, top, bottom, () -> editing = module);

		int tx = x + 30;
		int tw = w - 38;
		boolean toggleHover = clickable && hovered(mouseX, mouseY, tx, by, tw, 18);
		int bg = s.enabled ? (toggleHover ? Theme.LAGOON : Theme.SEA) : (toggleHover ? 0xFF1E4053 : 0xFF17323F);
		round(g, tx, by, tw, 18, bg);
		// Libellé court si la carte est étroite (petite fenêtre)
		String label = s.enabled ? "Activé" : "Désactivé";
		if (font.width(label) > tw - 6) label = s.enabled ? "On" : "Off";
		g.centeredText(font, label, tx + tw / 2, by + 5, s.enabled ? Theme.WHITE : Theme.TEXT_SOFT);
		clippedClick("toggle:" + module.id(), tx, by, tw, 18, top, bottom, () -> s.enabled = !s.enabled);
	}

	private void drawPreview(GuiGraphicsExtractor g, HudModule module, ModuleSettings s, int x, int y, int w, int h) {
		int mw = module.width(minecraft, s, true);
		int mh = module.height(minecraft, s, true);
		float scale = Math.min(1.2f, Math.min((float) w / mw, (float) h / mh));
		float px = x + (w - mw * scale) / 2f;
		float py = y + (h - mh * scale) / 2f;
		g.pose().pushMatrix();
		g.pose().translate(px, py);
		g.pose().scale(scale, scale);
		module.draw(g, minecraft, s, true);
		g.pose().popMatrix();
	}

	// ---------------------------------------------------------------- réglages d'un module

	private void drawSettings(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, int h, HudModule module) {
		ModuleSettings s = settings(module);
		button(g, mouseX, mouseY, x + PAD, y + PAD, 70, 18, "← Retour", false, () -> editing = null);
		g.text(font, bold(module.name()), x + PAD + 80, y + PAD + 5, Theme.WHITE, false);
		toggle("enabled", g, x + w - PAD - 24, y + PAD + 3, s.enabled, () -> s.enabled = !s.enabled);
		String state = s.enabled ? "Activé" : "Désactivé";
		int stateX = x + w - PAD - 30 - font.width(state);
		g.text(font, state, stateX, y + PAD + 5, Theme.TEXT_SOFT, false);
		int resetW = font.width("Réinitialiser") + 14;
		button(g, mouseX, mouseY, stateX - 10 - resetW, y + PAD, resetW, 18, "Réinitialiser", false, () -> AloriaHud.config().reset(module));

		// Aperçu à gauche
		int top = y + PAD + 30;
		int previewW = (w - PAD * 3) * 2 / 5;
		int previewH = h - (top - y) - PAD;
		round(g, x + PAD, top, previewW, previewH, 0xFF0B2130);
		roundOutline(g, x + PAD, top, previewW, previewH, Theme.BORDER);
		drawPreview(g, module, s, x + PAD + 8, top + 8, previewW - 16, previewH - 16);

		// Options à droite
		int ox = x + PAD * 2 + previewW;
		int ow = x + w - PAD - ox;
		int oy = top + 2;

		g.text(font, "Taille", ox, oy, Theme.FOAM, false);
		g.text(font, String.format("%.1fx", s.scale), ox + ow - font.width(String.format("%.1fx", s.scale)), oy, Theme.LAGOON, false);
		oy += 14;
		drawSlider(g, mouseX, mouseY, ox, oy, ow, s);
		oy += 20;

		g.text(font, "Couleur", ox, oy, Theme.FOAM, false);
		oy += 13;
		int sx = ox;
		int swatch = Math.min(16, (ow - 7 * 6) / 8);
		for (int i = 0; i < Theme.PALETTE.length; i++) {
			int color = Theme.PALETTE[i];
			round(g, sx, oy, swatch, swatch, color);
			if (s.color == color) roundOutline(g, sx - 2, oy - 2, swatch + 4, swatch + 4, Theme.WHITE);
			int c = color;
			onClick("color:" + i, sx, oy, swatch, swatch, () -> s.color = c);
			sx += swatch + 6;
		}
		oy += swatch + 14;

		g.text(font, "Fond", ox, oy + 2, Theme.FOAM, false);
		toggle("background", g, ox + ow - 24, oy, s.background, () -> s.background = !s.background);
		oy += 20;
		g.text(font, "Ombre du texte", ox, oy + 2, Theme.FOAM, false);
		toggle("shadow", g, ox + ow - 24, oy, s.shadow, () -> s.shadow = !s.shadow);

	}

	// Curseur de taille, de 0,5x à 3x
	private int sliderX;
	private int sliderW;

	private void drawSlider(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, ModuleSettings s) {
		sliderX = x;
		sliderW = w;
		float t = (s.scale - 0.5f) / 2.5f;
		int knob = x + Math.round(t * (w - 8));
		round(g, x, y + 3, w, 4, 0xFF1B3A4B);
		round(g, x, y + 3, knob - x + 4, 4, Theme.SEA);
		boolean hover = draggingSlider || hovered(mouseX, mouseY, knob, y, 8, 10);
		round(g, knob, y, 8, 10, hover ? Theme.WHITE : Theme.FOAM);
		onClick("slider", x, y - 3, w, 16, () -> {
			draggingSlider = true;
			setSlider(mouseX);
		});
	}

	private void setSlider(double mouseX) {
		if (editing == null || sliderW <= 8) return;
		float t = (float) Math.clamp((mouseX - sliderX - 4) / (sliderW - 8), 0, 1);
		settings(editing).scale = Math.round((0.5f + t * 2.5f) * 10) / 10f;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (draggingSlider) {
			setSlider(event.x());
			return true;
		}
		return false;
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		draggingSlider = false;
		return true;
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		if (editing != null) return false;
		scroll = Math.clamp(scroll - (int) Math.round(scrollY * 20), 0, maxScroll());
		return true;
	}

	@Override
	public void onClose() {
		if (editing != null) {
			editing = null;
			return;
		}
		super.onClose();
	}

	@Override
	public void removed() {
		AloriaHud.config().save();
	}
}
