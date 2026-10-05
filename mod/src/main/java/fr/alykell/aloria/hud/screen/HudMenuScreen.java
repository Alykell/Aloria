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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleConsumer;

/** Menu des modules, façon Lunar : une carte par module avec aperçu, réglages et activation. */
public class HudMenuScreen extends AloriaScreen {
	private static final String[][] TABS = {{"all", "Tous"}, {"info", "Infos"}, {"pvp", "PvP"}};
	private static final int COLUMNS = 4;
	private static final int GAP = 8;
	private static final int PAD = 12;
	private static final int CARD_H = 96;

	private String tab = "all";
	private @Nullable HudModule editing;
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
		text(g, bold("✦ ALORIA HUD"), x + 2, y - 22, Theme.WHITE, true);
		button(g, mouseX, mouseY, x + w - 22, y - 26, 22, 18, "✕", false, () -> minecraft.gui.setScreen(parent));
		var global = AloriaHud.config().global();
		toggle("font", g, x + w - 156, y - 23, global.smoothFont, () -> global.smoothFont = !global.smoothFont);
		text(g, "Police lisse", x + w - 162 - w("Police lisse"), y - 21, Theme.FOAM, false);
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
			int tw = w(t[1]) + 22;
			boolean active = tab.equals(t[0]);
			boolean hover = hovered(mouseX, mouseY, tx, y + PAD, tw, 18);
			round(g, tx, y + PAD, tw, 18, active ? Theme.SEA : hover ? Theme.CARD_HOVER : Theme.CARD);
			centered(g, t[1], tx + tw / 2, y + PAD + 5, active ? Theme.WHITE : Theme.FOAM);
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
		text(g, bold(module.name()), x + 8, y + 8, s.enabled ? Theme.WHITE : Theme.TEXT_SOFT, false);

		// Aperçu réel du module, réduit pour tenir dans la carte
		int areaY = y + 22;
		int areaH = CARD_H - 22 - 30;
		drawPreview(g, module, s, x + 6, areaY, w - 12, areaH);

		int by = y + CARD_H - 24;
		boolean gearHover = clickable && hovered(mouseX, mouseY, x + 8, by, 18, 18);
		round(g, x + 8, by, 18, 18, gearHover ? Theme.CARD_HOVER : 0x800B2130);
		centered(g, "⚙", x + 17, by + 5, gearHover ? Theme.LAGOON : Theme.FOAM);
		clippedClick("gear:" + module.id(), x + 8, by, 18, 18, top, bottom, () -> editing = module);

		int tx = x + 30;
		int tw = w - 38;
		boolean toggleHover = clickable && hovered(mouseX, mouseY, tx, by, tw, 18);
		int bg = s.enabled ? (toggleHover ? Theme.LAGOON : Theme.SEA) : (toggleHover ? 0xC01E4053 : 0xA017323F);
		round(g, tx, by, tw, 18, bg);
		// Libellé court si la carte est étroite (petite fenêtre)
		String label = s.enabled ? "Activé" : "Désactivé";
		if (w(label) > tw - 6) label = s.enabled ? "On" : "Off";
		centered(g, label, tx + tw / 2, by + 5, s.enabled ? Theme.WHITE : Theme.TEXT_SOFT);
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
		text(g, bold(module.name()), x + PAD + 80, y + PAD + 5, Theme.WHITE, false);
		String hint = module.hint();
		toggle("enabled", g, x + w - PAD - 24, y + PAD + 3, s.enabled, () -> s.enabled = !s.enabled);
		String state = s.enabled ? "Activé" : "Désactivé";
		int stateX = x + w - PAD - 30 - w(state);
		text(g, state, stateX, y + PAD + 5, Theme.TEXT_SOFT, false);
		int resetW = w("Réinitialiser") + 14;
		button(g, mouseX, mouseY, stateX - 10 - resetW, y + PAD, resetW, 18, "Réinitialiser", false, () -> AloriaHud.config().reset(module));

		// Aperçu à gauche
		int top = y + PAD + 30;
		int previewW = (w - PAD * 3) * 2 / 5;
		int previewH = h - (top - y) - PAD;
		round(g, x + PAD, top, previewW, previewH, 0x800B2130);
		roundOutline(g, x + PAD, top, previewW, previewH, Theme.BORDER);
		drawPreview(g, module, s, x + PAD + 8, top + 8, previewW - 16, previewH - 16);
		if (hint != null) centered(g, hint, x + PAD + previewW / 2, top + previewH - 12, Theme.TEXT_SOFT);

		// Options à droite, une ligne par réglage
		int ox = x + PAD * 2 + previewW;
		int ow = x + w - PAD - ox;
		int oy = top + 2;
		int labelW = 56;
		int cx = ox + labelW;
		int cw = ow - labelW;

		text(g, "Taille", ox, oy + 2, Theme.FOAM, false);
		drawSlider("slider", g, mouseX, mouseY, cx, oy, cw - 32, (s.scale - 0.5f) / 2.5f,
			t -> s.scale = Math.round((0.5 + t * 2.5) * 10) / 10f);
		text(g, String.format("%.1fx", s.scale), ox + ow - 26, oy + 2, Theme.LAGOON, false);
		oy += 20;

		text(g, "Opacité", ox, oy + 2, s.background ? Theme.FOAM : Theme.TEXT_SOFT, false);
		drawSlider("opacity", g, mouseX, mouseY, cx, oy, cw - 32, s.opacity / 100f, t -> s.opacity = (int) Math.round(t * 20) * 5);
		text(g, s.opacity + "%", ox + ow - 26, oy + 2, Theme.LAGOON, false);
		oy += 20;

		text(g, "Couleur", ox, oy + 3, Theme.FOAM, false);
		int swatch = Math.max(8, Math.min(14, (cw - 7 * 4) / 8));
		int sx = cx;
		for (int i = 0; i < Theme.PALETTE.length; i++) {
			int color = Theme.PALETTE[i];
			round(g, sx, oy, swatch, swatch, color);
			if (s.color == color) roundOutline(g, sx - 2, oy - 2, swatch + 4, swatch + 4, Theme.WHITE);
			int c = color;
			onClick("color:" + i, sx, oy, swatch, swatch, () -> s.color = c);
			sx += swatch + 4;
		}
		oy += Math.max(swatch, 12) + 8;

		int half = ow / 2;
		text(g, "Fond", ox, oy + 2, Theme.FOAM, false);
		toggle("background", g, ox + half - 34, oy, s.background, () -> s.background = !s.background);
		text(g, "Ombre", ox + half, oy + 2, Theme.FOAM, false);
		toggle("shadow", g, ox + ow - 24, oy, s.shadow, () -> s.shadow = !s.shadow);
	}

	// ---------------------------------------------------------------- curseurs

	/** Position des curseurs dessinés, pour les suivre pendant le glisser */
	private record Slider(int x, int w, DoubleConsumer setter) {
	}

	private final Map<String, Slider> sliders = new HashMap<>();
	private @Nullable String draggingSlider;

	/** Curseur horizontal ; t est la valeur entre 0 et 1 */
	private void drawSlider(String id, GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, float t, DoubleConsumer setter) {
		sliders.put(id, new Slider(x, w, setter));
		int knob = x + Math.round(Math.clamp(t, 0, 1) * (w - 8));
		round(g, x, y + 4, w, 4, 0xC01B3A4B);
		round(g, x, y + 4, knob - x + 4, 4, Theme.SEA);
		boolean hover = id.equals(draggingSlider) || hovered(mouseX, mouseY, knob, y, 8, 12);
		round(g, knob, y + 1, 8, 10, hover ? Theme.WHITE : Theme.FOAM);
		onClick(id, x, y - 2, w, 16, () -> {
			draggingSlider = id;
			setSlider(lastClickX);
		});
	}

	private void setSlider(double mouseX) {
		Slider slider = draggingSlider == null ? null : sliders.get(draggingSlider);
		if (slider == null || slider.w() <= 8) return;
		slider.setter().accept(Math.clamp((mouseX - slider.x() - 4) / (slider.w() - 8), 0, 1));
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (draggingSlider != null) {
			setSlider(event.x());
			return true;
		}
		return false;
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		draggingSlider = null;
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
