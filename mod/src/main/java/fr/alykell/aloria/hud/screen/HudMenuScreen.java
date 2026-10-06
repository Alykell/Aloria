package fr.alykell.aloria.hud.screen;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.Colors;
import fr.alykell.aloria.hud.Fonts;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.GlobalSettings;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

import java.util.List;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;

/** Menu des modules, façon Lunar : une carte par module avec aperçu, réglages et activation. */
public class HudMenuScreen extends AloriaScreen {
	private static final String[][] TABS = {{"all", "Tous"}, {"info", "Infos"}, {"pvp", "PvP"}, {"general", "Général"}};
	private static final int COLUMNS = 4;
	private static final int GAP = 8;
	private static final int PAD = 12;
	private static final int CARD_H = 96;
	private static final int ROW_H = 22;
	private static final int OPTION_ROWS = 7;

	private String tab = "all";
	private @Nullable HudModule editing;
	private int scroll;
	private int optionsScroll;
	private @Nullable Picker picker;
	private long appliedAt;

	/** Sélecteur de couleur ouvert : on garde la teinte à part pour ne pas la perdre sur les gris */
	private static final class Picker {
		final String title;
		final IntConsumer set;
		final boolean alpha;
		final int initial;
		float h;
		float s;
		float v;
		int a;

		Picker(String title, IntSupplier get, IntConsumer set, boolean alpha) {
			this.title = title;
			this.set = set;
			this.alpha = alpha;
			this.initial = get.getAsInt();
			load(initial);
		}

		void load(int argb) {
			float[] hsv = Colors.rgbToHsv(argb);
			// Sur un gris, la teinte n'a pas de sens : on garde la précédente
			if (hsv[1] > 0) h = hsv[0];
			s = hsv[1];
			v = hsv[2];
			a = alpha ? (argb >>> 24) : 0xFF;
		}

		int argb() {
			return (a << 24) | Colors.hsvToRgb(h, s, v);
		}

		void apply() {
			set.accept(argb());
		}
	}

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
		// Pas de survol sous le sélecteur de couleur
		int mx = picker != null ? -1 : mouseX;
		int my = picker != null ? -1 : mouseY;

		text(g, bold("✦ ALORIA HUD"), x + 2, y - 22, Theme.WHITE, true);
		button(g, mx, my, x + w - 22, y - 26, 22, 18, "✕", false, () -> minecraft.gui.setScreen(parent));
		button(g, mx, my, x + w - 126, y - 26, 100, 18, "✥ Disposition", true,
			() -> minecraft.gui.setScreen(new HudLayoutScreen(this)));

		round(g, x, y, w, h, Theme.WINDOW);
		roundOutline(g, x, y, w, h, Theme.BORDER);

		if (editing != null) drawSettings(g, mx, my, x, y, w, h, editing);
		else if (tab.equals("general")) drawGeneral(g, mx, my, x, y, w);
		else drawGrid(g, mx, my, x, y, w, h);

		if (picker != null) drawPicker(g, mouseX, mouseY, x, y, w, h, picker);
	}

	private void drawTabs(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y) {
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
	}

	// ---------------------------------------------------------------- grille des modules

	private void drawGrid(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, int h) {
		drawTabs(g, mouseX, mouseY, x, y);

		int top = y + PAD + 18 + 10;
		int bottom = y + h - PAD;
		int cardW = (w - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
		List<HudModule> modules = visibleModules();

		g.enableScissor(x + 1, top, x + w - 1, bottom);
		clip(top, bottom);
		for (int i = 0; i < modules.size(); i++) {
			int cx = x + PAD + (i % COLUMNS) * (cardW + GAP);
			int cy = top + (i / COLUMNS) * (CARD_H + GAP) - scroll;
			if (cy + CARD_H < top || cy > bottom) continue;
			drawCard(g, mouseX, mouseY, cx, cy, cardW, modules.get(i), mouseY >= top && mouseY < bottom);
		}
		unclip();
		g.disableScissor();
	}

	private int maxScroll() {
		int rows = (visibleModules().size() + COLUMNS - 1) / COLUMNS;
		int content = rows * (CARD_H + GAP) - GAP;
		int view = winH() - PAD * 2 - 28;
		return Math.max(0, content - view);
	}

	private void drawCard(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, HudModule module, boolean inView) {
		ModuleSettings s = settings(module);
		boolean hover = inView && hovered(mouseX, mouseY, x, y, w, CARD_H);
		round(g, x, y, w, CARD_H, s.enabled ? (hover ? Theme.CARD_HOVER : Theme.CARD) : Theme.CARD_OFF);
		roundOutline(g, x, y, w, CARD_H, hover ? Theme.BORDER_HOVER : Theme.BORDER);
		text(g, bold(module.name()), x + 8, y + 8, s.enabled ? Theme.WHITE : Theme.TEXT_SOFT, false);

		// Aperçu réel du module, réduit pour tenir dans la carte
		drawPreview(g, module, s, x + 6, y + 22, w - 12, CARD_H - 22 - 30);

		int by = y + CARD_H - 24;
		boolean gearHover = inView && hovered(mouseX, mouseY, x + 8, by, 18, 18);
		round(g, x + 8, by, 18, 18, gearHover ? Theme.CARD_HOVER : 0x800B2130);
		centered(g, "⚙", x + 17, by + 5, gearHover ? Theme.LAGOON : Theme.FOAM);
		onClick("gear:" + module.id(), x + 8, by, 18, 18, () -> {
			editing = module;
			optionsScroll = 0;
		});

		int tx = x + 30;
		int tw = w - 38;
		boolean toggleHover = inView && hovered(mouseX, mouseY, tx, by, tw, 18);
		int bg = s.enabled ? (toggleHover ? Theme.LAGOON : Theme.SEA) : (toggleHover ? 0xC01E4053 : 0xA017323F);
		round(g, tx, by, tw, 18, bg);
		// Libellé court si la carte est étroite (petite fenêtre)
		String label = s.enabled ? "Activé" : "Désactivé";
		if (w(label) > tw - 6) label = s.enabled ? "On" : "Off";
		centered(g, label, tx + tw / 2, by + 5, s.enabled ? Theme.WHITE : Theme.TEXT_SOFT);
		onClick("toggle:" + module.id(), tx, by, tw, 18, () -> s.enabled = !s.enabled);
	}

	private void drawPreview(GuiGraphicsExtractor g, HudModule module, ModuleSettings s, int x, int y, int w, int h) {
		int mw = module.width(minecraft, s, true);
		int mh = module.height(minecraft, s, true);
		float scale = Math.min(1.2f, Math.min((float) w / mw, (float) h / mh));
		g.pose().pushMatrix();
		g.pose().translate(x + (w - mw * scale) / 2f, y + (h - mh * scale) / 2f);
		g.pose().scale(scale, scale);
		module.draw(g, minecraft, s, true);
		g.pose().popMatrix();
	}

	// ---------------------------------------------------------------- onglet Général

	private void drawGeneral(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w) {
		drawTabs(g, mouseX, mouseY, x, y);
		GlobalSettings global = AloriaHud.config().global();
		int ox = x + PAD + 4;
		int oy = y + PAD + 18 + 18;

		text(g, bold("Police des menus"), ox, oy, Theme.WHITE, false);
		oy += 16;
		fontSelector(g, mouseX, mouseY, "menufont", ox, oy, 150, global.menuFont, f -> global.menuFont = f);
		oy += 30;

		text(g, bold("Tous les modules"), ox, oy, Theme.WHITE, false);
		oy += 16;
		String apply = "Appliquer cette police à tous les modules";
		button(g, mouseX, mouseY, ox, oy, Math.min(w - PAD * 2 - 8, w(apply) + 20), 18, apply, false, () -> {
			for (HudModule m : AloriaHud.modules()) settings(m).font = global.menuFont;
		});
		oy += 28;
		text(g, "Chaque module peut aussi avoir sa propre police dans ses réglages (⚙).", ox, oy, Theme.TEXT_SOFT, false);
	}

	/** ‹ Nom de la police › : le nom est écrit dans la police elle-même */
	private void fontSelector(GuiGraphicsExtractor g, int mouseX, int mouseY, String id, int x, int y, int w, String current, Consumer<String> set) {
		buttonWithId(id + ":prev", g, mouseX, mouseY, x, y, 16, 16, "‹", false, () -> set.accept(Fonts.cycle(current, -1)));
		buttonWithId(id + ":next", g, mouseX, mouseY, x + w - 16, y, 16, 16, "›", false, () -> set.accept(Fonts.cycle(current, 1)));
		g.centeredText(font, Fonts.text(current, Fonts.label(current)), x + w / 2, y + 4, Theme.WHITE);
	}

	// ---------------------------------------------------------------- réglages d'un module

	private void drawSettings(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, int h, HudModule module) {
		ModuleSettings s = settings(module);
		button(g, mouseX, mouseY, x + PAD, y + PAD, 70, 18, "← Retour", false, () -> editing = null);
		text(g, bold(module.name()), x + PAD + 80, y + PAD + 5, Theme.WHITE, false);
		toggle("enabled", g, x + w - PAD - 24, y + PAD + 3, s.enabled, () -> s.enabled = !s.enabled);
		String state = s.enabled ? "Activé" : "Désactivé";
		int stateX = x + w - PAD - 30 - w(state);
		text(g, state, stateX, y + PAD + 5, Theme.TEXT_SOFT, false);
		int resetW = w("Réinitialiser") + 14;
		button(g, mouseX, mouseY, stateX - 10 - resetW, y + PAD, resetW, 18, "Réinitialiser", false, () -> AloriaHud.config().reset(module));

		// Aperçu à gauche
		int top = y + PAD + 30;
		int bottom = y + h - PAD;
		int previewW = (w - PAD * 3) * 2 / 5;
		round(g, x + PAD, top, previewW, bottom - top, 0x800B2130);
		roundOutline(g, x + PAD, top, previewW, bottom - top, Theme.BORDER);
		drawPreview(g, module, s, x + PAD + 8, top + 8, previewW - 16, bottom - top - 24);
		String hint = module.hint();
		if (hint != null) centered(g, hint, x + PAD + previewW / 2, bottom - 12, Theme.TEXT_SOFT);

		// Options à droite, une ligne par réglage, qui défilent si la fenêtre est petite
		int ox = x + PAD * 2 + previewW;
		int ow = x + w - PAD - ox;
		int cx = ox + 58;
		int cw = ow - 58;
		optionsScroll = Math.clamp(optionsScroll, 0, Math.max(0, OPTION_ROWS * ROW_H - (bottom - top)));
		int oy = top + 4 - optionsScroll;

		g.enableScissor(ox - 2, top, ox + ow + 2, bottom);
		clip(top, bottom);

		label(g, "Taille", ox, oy);
		slider(g, mouseX, mouseY, "slider", cx, oy, cw - 32, (s.scale - 0.5f) / 2.5f,
			t -> s.scale = Math.round((0.5 + t * 2.5) * 10) / 10f);
		text(g, String.format("%.1fx", s.scale), ox + ow - 26, oy + 2, Theme.LAGOON, false);
		oy += ROW_H;

		label(g, "Police", ox, oy);
		fontSelector(g, mouseX, mouseY, "font", cx, oy - 2, cw, s.font, f -> s.font = f);
		oy += ROW_H;

		label(g, "Texte", ox, oy);
		swatch(g, mouseX, mouseY, "pick:text", cx, oy - 2, s.color,
			() -> openPicker(new Picker("Couleur du texte", () -> s.color, c -> s.color = c, false)));
		toggle("shadow", g, ox + ow - 24, oy, s.shadow, () -> s.shadow = !s.shadow);
		text(g, "Ombre", ox + ow - 30 - w("Ombre"), oy + 2, Theme.TEXT_SOFT, false);
		oy += ROW_H;

		label(g, "Fond", ox, oy);
		swatch(g, mouseX, mouseY, "pick:bg", cx, oy - 2, 0xFF000000 | s.bgColor,
			() -> openPicker(new Picker("Couleur du fond", () -> 0xFF000000 | s.bgColor, c -> s.bgColor = c & 0xFFFFFF, false)));
		toggle("background", g, ox + ow - 24, oy, s.background, () -> s.background = !s.background);
		oy += ROW_H;

		label(g, "Opacité", ox, oy);
		slider(g, mouseX, mouseY, "opacity", cx, oy, cw - 32, s.opacity / 100f, t -> s.opacity = (int) Math.round(t * 20) * 5);
		text(g, s.opacity + "%", ox + ow - 26, oy + 2, Theme.LAGOON, false);
		oy += ROW_H;

		label(g, "Bordure", ox, oy);
		swatch(g, mouseX, mouseY, "pick:border", cx, oy - 2, s.borderColor,
			() -> openPicker(new Picker("Couleur de la bordure", () -> s.borderColor, c -> s.borderColor = c, true)));
		buttonWithId("border:-", g, mouseX, mouseY, ox + ow - 62, oy - 2, 16, 16, "-", false, () -> s.borderWidth = Math.max(0, s.borderWidth - 1));
		centered(g, s.borderWidth + " px", ox + ow - 31, oy + 2, Theme.LAGOON);
		buttonWithId("border:+", g, mouseX, mouseY, ox + ow - 16, oy - 2, 16, 16, "+", false, () -> s.borderWidth = Math.min(3, s.borderWidth + 1));
		oy += ROW_H;

		boolean justApplied = System.currentTimeMillis() - appliedAt < 2000;
		buttonWithId("apply-all", g, mouseX, mouseY, ox, oy - 2, ow, 16,
			justApplied ? "✓ Appliqué à tous les modules" : "Appliquer fond, opacité et bordure à tous", false, () -> {
				for (HudModule m : AloriaHud.modules()) {
					ModuleSettings o = settings(m);
					o.background = s.background;
					o.bgColor = s.bgColor;
					o.opacity = s.opacity;
					o.borderColor = s.borderColor;
					o.borderWidth = s.borderWidth;
				}
				appliedAt = System.currentTimeMillis();
			});

		unclip();
		g.disableScissor();

		// Barre de défilement quand tous les réglages ne tiennent pas
		int content = OPTION_ROWS * ROW_H;
		int view = bottom - top;
		if (content > view) {
			int trackX = x + w - 6;
			round(g, trackX, top, 3, view, 0x40FFFFFF);
			int thumbH = Math.max(12, view * view / content);
			int thumbY = top + Math.round((view - thumbH) * optionsScroll / (float) (content - view));
			round(g, trackX, thumbY, 3, thumbH, Theme.LAGOON);
		}
	}

	private void label(GuiGraphicsExtractor g, String label, int x, int y) {
		text(g, label, x, y + 2, Theme.FOAM, false);
	}

	/** Pastille de couleur + code hexadécimal ; un clic ouvre le sélecteur */
	private void swatch(GuiGraphicsExtractor g, int mouseX, int mouseY, String id, int x, int y, int argb, Runnable open) {
		int w = 18 + 6 + w("#FFFFFF") + 8;
		boolean hover = hovered(mouseX, mouseY, x, y, w, 16);
		round(g, x, y, w, 16, hover ? Theme.CARD_HOVER : Theme.CARD);
		roundOutline(g, x, y, w, 16, hover ? Theme.BORDER_HOVER : Theme.BORDER);
		checker(g, x + 3, y + 3, 18, 10);
		g.fill(x + 3, y + 3, x + 21, y + 13, argb);
		text(g, Colors.hex(argb), x + 26, y + 4, Theme.FOAM, false);
		onClick(id, x, y, w, 16, open);
	}

	/** Damier gris, pour voir la transparence d'une couleur */
	private static void checker(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		for (int i = 0; i < w; i += 3) {
			for (int j = 0; j < h; j += 3) {
				g.fill(x + i, y + j, Math.min(x + w, x + i + 3), Math.min(y + h, y + j + 3), ((i + j) / 3) % 2 == 0 ? 0xFF9A9A9A : 0xFFD0D0D0);
			}
		}
	}

	/** Curseur horizontal ; t est la valeur entre 0 et 1 */
	private void slider(GuiGraphicsExtractor g, int mouseX, int mouseY, String id, int x, int y, int w, float t, DoubleConsumer set) {
		int knob = x + Math.round(Math.clamp(t, 0, 1) * (w - 8));
		round(g, x, y + 4, w, 4, 0xC01B3A4B);
		round(g, x, y + 4, knob - x + 4, 4, Theme.SEA);
		boolean hover = isDragging(id) || hovered(mouseX, mouseY, knob, y, 8, 12);
		round(g, knob, y + 1, 8, 10, hover ? Theme.WHITE : Theme.FOAM);
		// La valeur suit le centre du bouton : on retire sa demi-largeur aux deux bouts
		onDrag(id, x, y - 2, w, 16, (fx, fy) -> set.accept(Math.clamp((fx * (w - 1) - 4) / (w - 8), 0, 1)));
	}

	// ---------------------------------------------------------------- sélecteur de couleur

	private void drawPicker(GuiGraphicsExtractor g, int mouseX, int mouseY, int wx, int wy, int ww, int wh, Picker p) {
		// Un clic en dehors du sélecteur le ferme
		onClick("picker:close", 0, 0, width, height, this::closePicker);
		round(g, wx, wy, ww, wh, 0x90000000);

		int sw = 120;
		int sh = 70;
		int pw = sw + 20 + 46;
		int ph = 22 + sh + 6 + 8 + 8 + (p.alpha ? 12 : 0) + 20 + 22;
		int px = wx + (ww - pw) / 2;
		int py = wy + (wh - ph) / 2;
		round(g, px, py, pw, ph, 0xF20B1E2A);
		roundOutline(g, px, py, pw, ph, Theme.BORDER_HOVER);
		onClick("picker:panel", px, py, pw, ph, () -> {
		});
		text(g, bold(p.title), px + 10, py + 8, Theme.WHITE, false);

		// Carré saturation (horizontal) × luminosité (vertical)
		int sx = px + 10;
		int sy = py + 22;
		for (int i = 0; i < sw; i++) {
			int top = 0xFF000000 | Colors.hsvToRgb(p.h, i / (float) (sw - 1), 1f);
			g.fillGradient(sx + i, sy, sx + i + 1, sy + sh, top, 0xFF000000);
		}
		int cx = sx + Math.round(p.s * (sw - 1));
		int cy = sy + Math.round((1 - p.v) * (sh - 1));
		roundOutline(g, cx - 3, cy - 3, 7, 7, 0xFFFFFFFF);
		onDrag("picker:sv", sx, sy, sw, sh, (fx, fy) -> {
			p.s = fx;
			p.v = 1 - fy;
			p.apply();
			syncHex();
		});

		// Barre des teintes
		int hy = sy + sh + 6;
		for (int i = 0; i < sw; i++) g.fill(sx + i, hy, sx + i + 1, hy + 8, 0xFF000000 | Colors.hsvToRgb(i / (float) (sw - 1), 1f, 1f));
		int hx = sx + Math.round(p.h * (sw - 1));
		g.fill(hx - 1, hy - 2, hx + 2, hy + 10, 0xFFFFFFFF);
		onDrag("picker:hue", sx, hy - 2, sw, 12, (fx, fy) -> {
			p.h = fx;
			p.apply();
			syncHex();
		});

		int by = hy + 16;
		// Barre de transparence (bordure uniquement)
		if (p.alpha) {
			checker(g, sx, by, sw, 6);
			int rgb = Colors.hsvToRgb(p.h, p.s, p.v);
			for (int i = 0; i < sw; i++) g.fill(sx + i, by, sx + i + 1, by + 6, Theme.withAlpha(rgb, Math.round(i * 255f / (sw - 1))));
			int ax = sx + Math.round(p.a / 255f * (sw - 1));
			g.fill(ax - 1, by - 2, ax + 2, by + 8, 0xFFFFFFFF);
			onDrag("picker:alpha", sx, by - 2, sw, 10, (fx, fy) -> {
				p.a = Math.round(fx * 255);
				p.apply();
			});
			by += 12;
		}

		// Couleurs prédéfinies
		int rx = sx + sw + 10;
		for (int i = 0; i < Theme.PALETTE.length; i++) {
			int c = Theme.PALETTE[i];
			int x0 = rx + (i % 2) * 18;
			int y0 = sy + (i / 2) * 18;
			round(g, x0, y0, 14, 14, c);
			if ((p.argb() & 0xFFFFFF) == (c & 0xFFFFFF)) roundOutline(g, x0 - 2, y0 - 2, 18, 18, 0xFFFFFFFF);
			onClick("preset:" + i, x0, y0, 14, 14, () -> {
				p.load((p.a << 24) | (c & 0xFFFFFF));
				p.apply();
				syncHex();
			});
		}

		// Couleurs récentes
		text(g, "Récentes", sx, by + 3, Theme.TEXT_SOFT, false);
		int rcx = sx + w("Récentes") + 8;
		var recent = AloriaHud.config().global().recentColors;
		if (recent == null || recent.isEmpty()) text(g, "aucune pour l'instant", rcx, by + 3, 0x80FFFFFF, false);
		else {
			for (int i = 0; i < recent.size(); i++) {
				int c = recent.get(i);
				int x0 = rcx + i * 16;
				checker(g, x0, by + 1, 12, 12);
				round(g, x0, by + 1, 12, 12, c);
				onClick("recent:" + i, x0, by + 1, 12, 12, () -> {
					p.load(p.alpha ? c : 0xFF000000 | c);
					p.apply();
					syncHex();
				});
			}
		}
		by += 20;

		// Aperçu, code couleur à taper, validation
		checker(g, sx, by, 18, 12);
		g.fill(sx, by, sx + 18, by + 12, p.argb());
		text(g, "#", sx + 24, by + 2, Theme.FOAM, false);
		if (hexBox != null) {
			round(g, sx + 31, by - 2, 50, 16, 0xFF0B2130);
			roundOutline(g, sx + 31, by - 2, 50, 16, hexBox.isFocused() ? Theme.LAGOON : Theme.BORDER);
			hexBox.setX(sx + 35);
			hexBox.setY(by + 2);
		}
		if (p.alpha) text(g, Math.round(p.a / 2.55f) + " %", sx + 86, by + 2, Theme.FOAM, false);
		button(g, mouseX, mouseY, px + pw - 46, by - 2, 36, 16, "OK", true, this::closePicker);
	}

	// ---------------------------------------------------------------- champ du code couleur

	private @Nullable EditBox hexBox;
	private boolean syncing;

	private void openPicker(Picker p) {
		picker = p;
		hexBox = new EditBox(font, 0, 0, 44, 10, Component.literal("Code couleur"));
		hexBox.setBordered(false);
		hexBox.setMaxLength(6);
		hexBox.setTextColor(Theme.WHITE);
		syncHex();
		// Six chiffres hexadécimaux tapés : la couleur s'applique aussitôt
		hexBox.setResponder(v -> {
			if (syncing || picker == null) return;
			// Seuls les chiffres hexadécimaux sont gardés (0-9, A-F)
			String clean = v.replaceAll("[^0-9a-fA-F]", "");
			if (!clean.equals(v)) {
				syncing = true;
				hexBox.setValue(clean);
				syncing = false;
			}
			if (clean.length() != 6) return;
			v = clean;
			picker.load((picker.a << 24) | Integer.parseInt(v, 16));
			picker.apply();
		});
		addRenderableWidget(hexBox);
		setFocused(hexBox);
	}

	/** Pour l'auto-test : le champ du code couleur du sélecteur ouvert */
	public @Nullable EditBox hexBoxForTest() {
		return hexBox;
	}

	private void syncHex() {
		if (hexBox == null || picker == null) return;
		syncing = true;
		hexBox.setValue(String.format("%06X", picker.argb() & 0xFFFFFF));
		syncing = false;
	}

	private void closePicker() {
		if (picker != null && picker.argb() != (picker.alpha ? picker.initial : picker.initial | 0xFF000000)) {
			AloriaHud.config().global().addRecentColor(picker.argb());
		}
		picker = null;
		if (hexBox != null) removeWidget(hexBox);
		hexBox = null;
	}

	// ---------------------------------------------------------------- souris et clavier

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		if (picker != null) return true;
		if (editing != null) optionsScroll = Math.max(0, optionsScroll - (int) Math.round(scrollY * 16));
		else scroll = Math.clamp(scroll - (int) Math.round(scrollY * 20), 0, maxScroll());
		return true;
	}

	@Override
	public void onClose() {
		// Échap ferme d'abord le sélecteur, puis les réglages, puis le menu
		if (picker != null) closePicker();
		else if (editing != null) editing = null;
		else super.onClose();
	}

	@Override
	public void removed() {
		AloriaHud.config().save();
	}
}
