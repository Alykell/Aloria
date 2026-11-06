package fr.alykell.aloria.hud.screen;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.Colors;
import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.LegacyOptions;
import fr.alykell.aloria.hud.ModrinthPack;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.Visual;
import fr.alykell.aloria.hud.config.GlobalSettings;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.config.VisualSettings;
import fr.alykell.aloria.hud.module.HudModule;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.TextFieldWidget;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Menu d'Aloria HUD (1.8.9, même présentation que mod/) : catégories dans une barre à gauche, cartes des modules avec aperçu,
 * modules de rendu (ex-écran Visuel), page des packs de ressources appliqués en une fois, et réglages globaux.
 */
public class HudMenuScreen extends AloriaScreen {
	/** Entrées de la barre latérale ; les deux dernières, sous un trait, ne sont pas des catégories de modules */
	private static final String[][] SIDE = {
		{"all", "menu.tab.all"}, {"info", "menu.tab.info"}, {"pvp", "menu.tab.pvp"}, {"render", "menu.tab.render"}, {"game", "menu.tab.game"},
		{"packs", "menu.tab.packsShort"}, {"general", "menu.tab.general"}
	};
	/** Catégories de modules, dans l'ordre des groupes de « Tous » */
	private static final String[] GROUPS = {"info", "pvp", "render", "game"};
	private static final int GAP = 6;
	private static final int PAD = 10;
	private static final int CARD_H = 80;
	private static final int ROW_H = 22;
	private static final int OPTION_ROWS = 8;
	private static final int HEADER_H = 30;

	private String tab = "all";
	private HudModule editing;
	private TextFieldWidget search;
	private int searchW;
	private String query = "";
	/** Packs cochés ou décochés, pas encore appliqués */
	private final Map<ModrinthPack, Boolean> wanted = new LinkedHashMap<>();
	/** Hauteur du contenu de la grille et de sa zone visible (calculées au dessin, pour le défilement) */
	private int gridContent;
	private int gridView;

	private boolean hasBiomeOption() {
		return editing != null && "coords".equals(editing.id());
	}

	/** Lignes de réglages du module ouvert (pour le défilement) */
	private int optionRows() {
		return OPTION_ROWS + (hasBiomeOption() ? 1 : 0);
	}
	private int scroll;
	private int optionsScroll;
	private Picker picker;
	private long appliedAt;
	private TextFieldWidget hexBox;
	private String hexBefore = "";

	/** Couleur à régler par le sélecteur */
	private interface ColorGetter {
		int get();
	}

	private interface ColorSetter {
		void set(int argb);
	}

	private interface Flag {
		boolean get();
	}

	/** Module de la catégorie Rendu : réglages dans un panneau compact (section) ou simple interrupteur */
	private static final class RenderEntry {
		final String id;
		final String nameKey;
		final String hintKey;
		final String section;
		final Flag on;
		final Runnable toggle;

		RenderEntry(String id, String nameKey, String hintKey, String section, Flag on, Runnable toggle) {
			this.id = id;
			this.nameKey = nameKey;
			this.hintKey = hintKey;
			this.section = section;
			this.on = on;
			this.toggle = toggle;
		}
	}

	private static final List<RenderEntry> RENDER = Arrays.asList(
		new RenderEntry("hands", "visual.tab.hands", "render.handsHint", "hands", null, null),
		new RenderEntry("fog", "visual.tab.fog", "render.fogHint", "fog", null, null),
		new RenderEntry("fullbright", "render.fullbright", "visual.fullbrightHint", null,
			() -> v().fullbright, () -> v().fullbright = !v().fullbright),
		new RenderEntry("pumpkin", "render.pumpkin", "visual.hidePumpkinHint", null,
			() -> v().hidePumpkin, () -> v().hidePumpkin = !v().hidePumpkin)
	);

	private static VisualSettings v() {
		return Visual.settings();
	}

	/** Une carte de la grille : un module du HUD ou un module de rendu */
	private static final class Entry {
		final String id;
		final String category;
		final String name;
		final HudModule module;
		final RenderEntry render;

		Entry(String id, String category, String name, HudModule module, RenderEntry render) {
			this.id = id;
			this.category = category;
			this.name = name;
			this.module = module;
			this.render = render;
		}
	}

	/** Sélecteur de couleur ouvert : on garde la teinte à part pour ne pas la perdre sur les gris */
	private static final class Picker {
		final String title;
		final ColorSetter set;
		final boolean alpha;
		final int initial;
		float h;
		float s;
		float v;
		int a;

		Picker(String title, ColorGetter get, ColorSetter set, boolean alpha) {
			this.title = title;
			this.set = set;
			this.alpha = alpha;
			this.initial = get.get();
			load(initial);
		}

		void load(int argb) {
			float[] hsv = Colors.rgbToHsv(argb);
			if (hsv[1] > 0) h = hsv[0];
			s = hsv[1];
			v = hsv[2];
			a = alpha ? (argb >>> 24) : 0xFF;
		}

		int argb() {
			return (a << 24) | Colors.hsvToRgb(h, s, v);
		}

		void apply() {
			set.set(argb());
		}
	}

	public HudMenuScreen(Screen parent) {
		super(parent);
	}

	/** Ouvre directement les réglages d'un module (clic droit dans l'éditeur de disposition) */
	public HudMenuScreen(Screen parent, HudModule module) {
		this(parent);
		this.editing = module;
		this.tab = module.category();
	}

	/** Ouvre le menu sur une catégorie (auto-test) */
	public HudMenuScreen category(String id) {
		tab = id;
		return this;
	}

	public Screen parentScreen() {
		return parent;
	}

	private ModuleSettings settings(HudModule m) {
		return AloriaHud.config().get(m);
	}

	public static int categoryColor(String category) {
		switch (category) {
			case "info": return Theme.CAT_INFO;
			case "pvp": return Theme.CAT_PVP;
			case "render": return Theme.CAT_RENDER;
			case "packs": return Theme.CAT_PACKS;
			case "game": return Theme.CAT_GAME;
			case "general": return Theme.UI_MUTED;
			default: return Theme.CAT_ALL;
		}
	}

	private int winW() {
		return Math.min(600, width - 20);
	}

	private int winH() {
		return Math.min(310, height - 24);
	}

	private int winX() {
		return (width - winW()) / 2;
	}

	private int winY() {
		return (height - winH()) / 2;
	}

	private int sideW() {
		return winW() < 440 ? 96 : 116;
	}

	private void selectCategory(String id) {
		if (tab.equals("packs") && !id.equals("packs")) applyPacks();
		tab = id;
		editing = null;
		scroll = 0;
	}

	@Override
	protected void draw(G g, int mouseX, int mouseY) {
		int x = winX();
		int y = winY();
		int w = winW();
		int h = winH();
		int side = sideW();
		int mx = picker != null ? -1 : mouseX;
		int my = picker != null ? -1 : mouseY;
		String current = editing != null ? editing.category() : tab;

		round(g, x, y, w, h, Theme.UI_PANEL);
		round(g, x, y, side, h, Theme.UI_SIDE);
		g.fill(x + side - 3, y, x + side, y + h, Theme.UI_SIDE);
		g.fill(x + side, y, x + side + 1, y + h, Theme.UI_LINE);
		roundOutline(g, x, y, w, h, Theme.UI_LINE);
		drawSide(g, mx, my, x, y, side, h, current);

		accent = categoryColor(current);
		int cx = x + side + 1;
		int cw = w - side - 1;
		searchVisible = false;

		if (editing != null) drawSettings(g, mx, my, cx, y, cw, h, editing);
		else if (tab.equals("packs")) drawPacks(g, mx, my, cx, y, cw, h);
		else if (tab.equals("general")) {
			drawHeader(g, mx, my, cx, y, cw, false);
			drawGeneral(g, mx, my, cx, y + HEADER_H, cw);
		} else {
			drawHeader(g, mx, my, cx, y, cw, picker == null);
			drawGrid(g, mx, my, cx, y + HEADER_H, cw, h - HEADER_H);
		}
		if (!searchVisible && search != null) search.setFocused(false);

		if (picker != null) drawPicker(g, mouseX, mouseY, x, y, w, h, picker);
	}

	private void closeAll() {
		client.setScreen(parent);
	}

	// ---------------------------------------------------------------- barre latérale

	private int count(String id) {
		switch (id) {
			case "all": return AloriaHud.modules().size() + RENDER.size();
			case "render": return RENDER.size();
			case "packs": return ModrinthPack.ALL.size();
			case "general": return -1;
			default:
				int n = 0;
				for (HudModule m : AloriaHud.modules()) if (m.category().equals(id)) n++;
				return n;
		}
	}

	private void drawSide(G g, int mouseX, int mouseY, int x, int y, int w, int h, String current) {
		text(g, "✦", x + 9, y + 10, Theme.UI_ACCENT, false);
		text(g, bold("ALORIA HUD"), x + 20, y + 10, Theme.WHITE, false);

		int ey = y + 28;
		for (String[] entry : SIDE) {
			final String id = entry[0];
			if (id.equals("packs")) {
				g.fill(x + 8, ey + 3, x + w - 8, ey + 4, Theme.UI_LINE);
				ey += 8;
			}
			int color = categoryColor(id);
			boolean active = id.equals(current);
			boolean hover = hovered(mouseX, mouseY, x + 4, ey, w - 8, 16);
			if (active) {
				round(g, x + 4, ey, w - 8, 16, Theme.withAlpha(color, 0x2E));
				g.fill(x + 4, ey + 3, x + 6, ey + 13, color);
			} else if (hover) round(g, x + 4, ey, w - 8, 16, 0x14FFFFFF);
			round(g, x + 11, ey + 6, 4, 4, color);
			String name = Tr.tr(entry[1]);
			text(g, name, x + 20, ey + 4, active ? Theme.WHITE : hover ? Theme.UI_TEXT : Theme.UI_MUTED, false);
			int n = count(id);
			String num = String.valueOf(n);
			if (n >= 0 && x + 20 + w(name) + 6 + w(num) < x + w - 10) {
				text(g, num, x + w - 10 - w(num), ey + 4, Theme.UI_DIM, false);
			}
			onClick("tab:" + id, x + 4, ey, w - 8, 16, () -> selectCategory(id));
			ey += 18;
		}

		// Disposition, toujours avec l'accent d'Aloria
		int saved = accent;
		accent = Theme.UI_ACCENT;
		button(g, mouseX, mouseY, x + 6, y + h - 26, w - 12, 18, Tr.tr("menu.layout"), true, () -> client.setScreen(new HudLayoutScreen(this)));
		accent = saved;
	}

	/** Le champ de recherche est dessiné sur cette image (sinon il perd le clavier) */
	private boolean searchVisible;

	/** Titre de la page (pastille de couleur), recherche et fermeture */
	private void drawHeader(G g, int mouseX, int mouseY, int x, int y, int w, boolean withSearch) {
		int color = categoryColor(tab);
		round(g, x + PAD, y + 12, 6, 6, color);
		String title = Tr.tr(tab.equals("packs") ? "menu.tab.packs" : sideKey(tab));
		text(g, bold(title), x + PAD + 11, y + 11, Theme.WHITE, false);
		button(g, mouseX, mouseY, x + w - PAD - 16, y + 7, 16, 16, "✕", false, this::closeAll);

		if (!withSearch) return;
		int sw = Math.min(130, w - PAD * 2 - 16 - 8 - w(bold(title)) - 30);
		if (sw < 50) return;
		int sx = x + w - PAD - 16 - 6 - sw;
		// Largeur fixée à la création en 1.8.9 : champ refait si la fenêtre change de taille
		if (search == null || searchW != sw - 20) {
			boolean wasFocused = search != null && search.isFocused();
			searchW = sw - 20;
			search = new TextFieldWidget(1, textRenderer, 0, 0, searchW, 10);
			search.setFocused(wasFocused);
			search.setHasBorder(false);
			search.setMaxLength(32);
			search.setEditableColor(Theme.UI_TEXT);
			search.setText(query);
		}
		searchVisible = true;
		boolean focused = search.isFocused();
		round(g, sx, y + 7, sw, 16, Theme.UI_INSET);
		roundOutline(g, sx, y + 7, sw, 16, focused ? color : Theme.UI_LINE);
		// Loupe : un cercle et son manche
		roundOutline(g, sx + 5, y + 11, 6, 6, Theme.UI_MUTED);
		g.fill(sx + 10, y + 16, sx + 12, y + 18, Theme.UI_MUTED);
		search.x = sx + 16;
		search.y = y + 11;
		if (query.isEmpty() && !focused) text(g, Tr.tr("menu.search"), sx + 16, y + 11, Theme.UI_DIM, false);
		else search.render();
	}

	private static String sideKey(String id) {
		for (String[] entry : SIDE) {
			if (entry[0].equals(id)) return entry[1];
		}
		return "menu.tab.all";
	}

	// ---------------------------------------------------------------- grille des modules

	private List<Entry> entries(String category) {
		List<Entry> list = new ArrayList<>();
		String q = query.trim().toLowerCase(Locale.ROOT);
		if (!category.equals("render")) {
			for (HudModule m : AloriaHud.modules()) {
				if (m.category().equals(category) && m.name().toLowerCase(Locale.ROOT).contains(q)) {
					list.add(new Entry(m.id(), category, m.name(), m, null));
				}
			}
		} else {
			for (RenderEntry r : RENDER) {
				String name = Tr.tr(r.nameKey);
				if (name.toLowerCase(Locale.ROOT).contains(q)) list.add(new Entry(r.id, "render", name, null, r));
			}
		}
		return list;
	}

	private void drawGrid(G g, int mouseX, int mouseY, int x, int y, int w, int h) {
		int top = y;
		int bottom = y + h - PAD;
		int inner = w - PAD * 2;
		int columns = inner >= 400 ? 4 : inner >= 290 ? 3 : 2;
		int cardW = (inner - GAP * (columns - 1)) / columns;
		boolean grouped = tab.equals("all") || !query.trim().isEmpty();
		String[] groups = grouped ? GROUPS : new String[] {tab};

		g.enableScissor(x, top, x + w - 1, bottom);
		clip(top, bottom);
		int cy = top - scroll;
		boolean any = false;
		boolean inView = mouseY >= top && mouseY < bottom;
		for (String group : groups) {
			List<Entry> list = entries(group);
			if (list.isEmpty()) continue;
			any = true;
			if (grouped) {
				int color = categoryColor(group);
				String label = Tr.tr(sideKey(group)).toUpperCase(Locale.ROOT);
				text(g, label, x + PAD + 1, cy + 3, color, false);
				g.fill(x + PAD + w(label) + 7, cy + 7, x + w - PAD, cy + 8, Theme.withAlpha(color, 0x40));
				cy += 15;
			}
			for (int i = 0; i < list.size(); i++) {
				int ex = x + PAD + (i % columns) * (cardW + GAP);
				int ey = cy + (i / columns) * (CARD_H + GAP);
				if (ey + CARD_H >= top && ey <= bottom) drawCard(g, mouseX, mouseY, ex, ey, cardW, list.get(i), inView);
			}
			cy += ((list.size() + columns - 1) / columns) * (CARD_H + GAP) + 4;
		}
		if (!any) centered(g, Tr.tr("menu.noResult"), x + w / 2, top + 30, Theme.UI_MUTED);
		unclip();
		g.disableScissor();

		gridContent = cy + scroll - top;
		gridView = bottom - top;
		scroll = Draw.clamp(scroll, 0, Math.max(0, gridContent - gridView));
		if (gridContent > gridView) {
			int trackX = x + w - 5;
			round(g, trackX, top, 3, gridView, Theme.UI_TRACK);
			int thumbH = Math.max(12, gridView * gridView / gridContent);
			int thumbY = top + Math.round((gridView - thumbH) * scroll / (float) (gridContent - gridView));
			round(g, trackX, thumbY, 3, thumbH, accent);
		}
	}

	private void drawCard(G g, int mouseX, int mouseY, int x, int y, int w, Entry e, boolean inView) {
		int color = categoryColor(e.category);
		final HudModule module = e.module;
		final RenderEntry render = e.render;
		final ModuleSettings s = module != null ? settings(module) : null;
		boolean toggleable = module != null || render.toggle != null;
		boolean on = module != null ? s.enabled : render.on == null || render.on.get();
		boolean hover = inView && hovered(mouseX, mouseY, x, y, w, CARD_H);

		round(g, x, y, w, CARD_H, hover ? Theme.UI_CARD_HOVER : Theme.UI_CARD);
		roundOutline(g, x, y, w, CARD_H, hover ? Theme.mix(Theme.UI_LINE, color, 0.6f) : Theme.UI_LINE);
		String name = e.name;
		while (name.length() > 1 && w(bold(name)) > w - 14) name = name.substring(0, name.length() - 2) + "…";
		text(g, bold(name), x + 7, y + 7, on ? Theme.WHITE : Theme.UI_MUTED, false);

		// Aperçu : le vrai module réduit, ou l'explication d'un module de rendu
		int px = x + 5;
		int py = y + 19;
		int pw = w - 10;
		int ph = CARD_H - 19 - 21;
		round(g, px, py, pw, ph, Theme.mix(Theme.UI_INSET, color, 0.08f));
		if (module != null) {
			drawPreview(g, module, s, px + 3, py + 2, pw - 6, ph - 4);
		} else {
			List<String> lines = wrap(Tr.tr(render.hintKey), pw - 8, 3);
			int ly = py + (ph - lines.size() * 10) / 2 + 1;
			for (String line : lines) {
				centered(g, line, px + pw / 2, ly, Theme.UI_MUTED);
				ly += 10;
			}
		}
		if (!on) round(g, px, py, pw, ph, 0x990D1120);

		// Clic sur la carte : réglages (ou interrupteur pour un module de rendu sans réglages)
		Runnable open;
		if (module != null) open = () -> {
			editing = module;
			optionsScroll = 0;
		};
		else if (render.section != null) open = () -> client.setScreen(new VisualScreen(this, render.section));
		else open = render.toggle;
		onClick("gear:" + e.id, x, y, w, CARD_H, open);

		int by = y + CARD_H - 16;
		if (toggleable) {
			String state = Tr.tr(on ? "menu.enabled" : "menu.disabled");
			text(g, state, x + 7, by + 2, on ? Theme.UI_TEXT : Theme.UI_DIM, false);
			int saved = accent;
			accent = color;
			Runnable flip = module != null ? () -> s.enabled = !s.enabled : render.toggle;
			toggle("toggle:" + e.id, g, x + w - 7 - 24, by + 1, on, flip);
			accent = saved;
		} else {
			String adjust = Tr.tr("menu.adjust");
			String always = Tr.tr("menu.alwaysOn");
			if (w(always) + w(adjust) + 22 <= w) text(g, always, x + 7, by + 2, Theme.UI_DIM, false);
			text(g, adjust, x + w - 7 - w(adjust), by + 2, color, false);
		}
	}

	private void drawPreview(G g, HudModule module, ModuleSettings s, int x, int y, int w, int h) {
		int mw = module.width(client, g, s, true);
		int mh = module.height(client, g, s, true);
		float scale = Math.min(1.2f, Math.min((float) w / mw, (float) h / mh));
		g.push();
		g.translate(x + (w - mw * scale) / 2f, y + (h - mh * scale) / 2f);
		g.scale(scale);
		module.draw(g, client, s, true);
		g.pop();
	}

	/** Coupe un texte en lignes d'au plus maxW pixels ; « … » si tout ne tient pas */
	private List<String> wrap(String text, int maxW, int maxLines) {
		List<String> lines = new ArrayList<>();
		String current = "";
		for (String word : text.split(" ")) {
			String next = current.isEmpty() ? word : current + " " + word;
			if (current.isEmpty() || w(next) <= maxW) current = next;
			else {
				lines.add(current);
				current = word;
			}
		}
		if (!current.isEmpty()) lines.add(current);
		if (lines.size() > maxLines) {
			lines = new ArrayList<>(lines.subList(0, maxLines));
			String last = lines.get(maxLines - 1);
			while (last.length() > 1 && w(last + "…") > maxW) last = last.substring(0, last.length() - 1);
			lines.set(maxLines - 1, last + "…");
		}
		return lines;
	}

	// ---------------------------------------------------------------- packs de ressources

	/** État voulu d'un pack : coché ou non (pendant un téléchargement, il compte comme coché) */
	private boolean wantedOf(ModrinthPack pack) {
		if (pack.status() == ModrinthPack.Status.DOWNLOADING) return true;
		Boolean on = wanted.get(pack);
		return on != null ? on : pack.active();
	}

	private int pendingPacks() {
		int n = 0;
		for (ModrinthPack pack : ModrinthPack.ALL) {
			if (pack.status() != ModrinthPack.Status.DOWNLOADING && wantedOf(pack) != pack.active()) n++;
		}
		return n;
	}

	/** Applique les packs cochés : un seul rechargement des ressources du jeu */
	private void applyPacks() {
		if (pendingPacks() > 0) ModrinthPack.applyAll(new LinkedHashMap<>(wanted));
		wanted.clear();
	}

	private void drawPacks(G g, int mouseX, int mouseY, int x, int y, int w, int h) {
		drawHeader(g, mouseX, mouseY, x, y, w, false);
		String sub = Tr.tr("menu.packs.hint");
		int titleEnd = x + PAD + 11 + w(bold(Tr.tr("menu.tab.packs"))) + 8;
		if (titleEnd + w(sub) < x + w - PAD - 24) text(g, sub, titleEnd, y + 11, Theme.UI_MUTED, false);

		// Liste qui défile si tous les packs ne tiennent pas
		int rw = w - PAD * 2;
		int listTop = y + HEADER_H;
		int listBottom = y + h - PAD - 24 - 6;
		gridContent = ModrinthPack.ALL.size() * (40 + GAP) - GAP;
		gridView = listBottom - listTop;
		scroll = Draw.clamp(scroll, 0, Math.max(0, gridContent - gridView));
		boolean inView = mouseY >= listTop && mouseY < listBottom;
		g.enableScissor(x, listTop, x + w - 1, listBottom);
		clip(listTop, listBottom);
		int ry = listTop - scroll;
		for (ModrinthPack pack : ModrinthPack.ALL) {
			if (ry + 40 >= listTop && ry <= listBottom) drawPackRow(g, inView ? mouseX : -1, inView ? mouseY : -1, x + PAD, ry, rw - (gridContent > gridView ? 6 : 0), pack);
			ry += 40 + GAP;
		}
		unclip();
		g.disableScissor();
		if (gridContent > gridView) {
			int trackX = x + w - PAD - 3;
			round(g, trackX, listTop, 3, gridView, Theme.UI_TRACK);
			int thumbH = Math.max(12, gridView * gridView / gridContent);
			int thumbY = listTop + Math.round((gridView - thumbH) * scroll / (float) (gridContent - gridView));
			round(g, trackX, thumbY, 3, thumbH, Theme.CAT_PACKS);
		}

		int n = pendingPacks();
		int bh = 24;
		int bx = x + PAD;
		int by = y + h - PAD - bh;
		boolean downloading = false;
		for (ModrinthPack p : ModrinthPack.ALL) if (p.status() == ModrinthPack.Status.DOWNLOADING) downloading = true;
		round(g, bx, by, rw, bh, n > 0 ? Theme.mix(Theme.UI_INSET, Theme.CAT_PACKS, 0.1f) : Theme.UI_INSET);
		roundOutline(g, bx, by, rw, bh, n > 0 ? Theme.withAlpha(Theme.CAT_PACKS, 0x80) : Theme.UI_LINE);
		String status = n > 0 ? Tr.tr(n == 1 ? "menu.packs.pendingOne" : "menu.packs.pending", n)
			: Tr.tr(downloading ? "visual.redstone.downloading" : "menu.packs.upToDate");
		String apply = Tr.tr("menu.packs.apply");
		int aw = w(apply) + 16;
		int room = rw - 16 - (n > 0 ? aw + 8 : 0);
		text(g, wrap(status, room, 1).get(0), bx + 8, by + 8, n > 0 ? Theme.UI_TEXT : Theme.UI_MUTED, false);
		if (n > 0) buttonWithId("packs:apply", g, mouseX, mouseY, bx + rw - aw - 4, by + 3, aw, 18, apply, true, this::applyPacks);
	}

	private void drawPackRow(G g, int mouseX, int mouseY, int x, int y, int w, final ModrinthPack pack) {
		final boolean on = wantedOf(pack);
		boolean changed = pack.status() != ModrinthPack.Status.DOWNLOADING && on != pack.active();
		boolean hover = hovered(mouseX, mouseY, x, y, w, 40);
		round(g, x, y, w, 40, hover ? Theme.UI_CARD_HOVER : Theme.UI_CARD);
		roundOutline(g, x, y, w, 40, changed ? Theme.withAlpha(Theme.CAT_PACKS, 0xA0) : Theme.UI_LINE);

		// Vignette en petits carrés, aux couleurs du pack
		int tx = x + 7;
		int ty = y + 8;
		for (int i = 0; i < 4; i++) {
			for (int j = 0; j < 4; j++) {
				float t = ((i * 7 + j * 3 + i * j) % 5) / 5f;
				g.fill(tx + i * 6, ty + j * 6, tx + i * 6 + 6, ty + j * 6 + 6, Theme.mix(Theme.mix(pack.color, 0xFF000000, 0.45f), pack.color, t));
			}
		}

		int textX = tx + 24 + 9;
		int textW = w - (textX - x) - 30;
		String title = Tr.tr("visual." + pack.id);
		while (title.length() > 1 && w(bold(title)) > textW) title = title.substring(0, title.length() - 2) + "…";
		text(g, bold(title), textX, y + 7, Theme.WHITE, false);
		// Petite mention pour les packs faits par Aloria
		String tag = Tr.tr("menu.packs.aloria");
		int tagX = textX + w(bold(title)) + 8;
		if (pack.aloria() && tagX + w(tag) <= textX + textW) text(g, tag, tagX, y + 7, Theme.withAlpha(Theme.CAT_PACKS, 0xC0), false);
		String hint;
		int hintColor = Theme.UI_MUTED;
		switch (pack.status()) {
			case DOWNLOADING:
				hint = Tr.tr("visual.redstone.downloading");
				hintColor = Theme.CAT_PACKS;
				break;
			case FAILED:
				hint = Tr.tr("visual.redstone.failed");
				hintColor = Theme.CORAL;
				break;
			case UNAVAILABLE:
				hint = Tr.tr("visual.redstone.unavailable");
				break;
			default:
				hint = Tr.tr("visual." + pack.id + "Hint");
		}
		int ly = y + 19;
		for (String line : wrap(hint, textW, 2)) {
			text(g, line, textX, ly, hintColor, false);
			ly += 10;
		}

		// Case à cocher : rien n'est rechargé avant « Appliquer » ou la sortie de la page
		int cx = x + w - 20;
		int cy = y + 14;
		if (on) {
			round(g, cx, cy, 12, 12, Theme.CAT_PACKS);
			for (int i = 0; i < 3; i++) g.fill(cx + 3 + i, cy + 6 + i, cx + 5 + i, cy + 7 + i, ON_ACCENT);
			for (int i = 0; i < 5; i++) g.fill(cx + 5 + i, cy + 8 - i, cx + 7 + i, cy + 9 - i, ON_ACCENT);
		} else {
			round(g, cx, cy, 12, 12, Theme.UI_INSET);
			roundOutline(g, cx, cy, 12, 12, hover ? Theme.CAT_PACKS : Theme.UI_TRACK);
		}
		if (pack.status() != ModrinthPack.Status.DOWNLOADING) {
			onClick("pack:" + pack.id, x, y, w, 40, () -> wanted.put(pack, !on));
		}
	}

	// ---------------------------------------------------------------- réglages globaux

	private void drawGeneral(G g, int mouseX, int mouseY, int x, int y, int w) {
		final GlobalSettings global = AloriaHud.config().global();
		int ox = x + PAD + 2;
		int oy = y + 4;

		text(g, bold(Tr.tr("general.allModules")), ox, oy, Theme.WHITE, false);
		oy += 16;
		String same = Tr.tr("general.sameColor");
		toggle("sameTextColor", g, ox, oy + 2, global.sameTextColor, () -> global.sameTextColor = !global.sameTextColor);
		text(g, same, ox + 32, oy + 4, Theme.UI_TEXT, false);
		swatch(g, mouseX, mouseY, "pick:global-text", ox + 40 + w(same), oy, global.textColor,
			() -> openPicker(new Picker(Tr.tr("picker.sharedText"), () -> global.textColor, c -> global.textColor = c, false)));
		oy += 20;
		text(g, Tr.tr("general.ownHintShort"), ox, oy, Theme.UI_MUTED, false);
		oy += 16;

		// Réglages des versions récentes, ajoutés à la 1.8.9 (synchronisés avec le launcher via options.txt)
		text(g, bold(Tr.tr("general.game")), ox, oy, Theme.WHITE, false);
		oy += 14;
		// Interrupteurs alignés en colonnes (marge large : la police mesure un peu court certains signes)
		String rawInput = Tr.tr("game.rawInput"), toggleSprint = Tr.tr("game.toggleSprint"), toggleCrouch = Tr.tr("game.toggleCrouch");
		int labels = Math.max(w(rawInput), w(toggleCrouch)) + 20;
		int col2 = ox + labels + 40;
		int labels2 = w(toggleSprint) + 20;
		gameToggle(g, "rawMouseInput", rawInput, ox, labels, oy, LegacyOptions.rawMouseInput, () -> LegacyOptions.rawMouseInput = !LegacyOptions.rawMouseInput);
		gameToggle(g, "toggleSprint", toggleSprint, col2, labels2, oy, LegacyOptions.toggleSprint, () -> LegacyOptions.toggleSprint = !LegacyOptions.toggleSprint);
		oy += 16;
		gameToggle(g, "toggleCrouch", toggleCrouch, ox, labels, oy, LegacyOptions.toggleCrouch, () -> LegacyOptions.toggleCrouch = !LegacyOptions.toggleCrouch);
		oy += 16;
		text(g, Tr.tr("game.fovEffects"), ox, oy + 2, Theme.UI_TEXT, false);
		int sx = ox + labels;
		slider(g, mouseX, mouseY, "fovEffectScale", sx, oy, 120, LegacyOptions.fovEffectScale, t -> {
			LegacyOptions.fovEffectScale = Math.round(t * 20) / 20f;
			optionsChanged = true;
		});
		int percent = Math.round(LegacyOptions.fovEffectScale * 100);
		text(g, percent == 0 ? Tr.tr("menu.disabled") : Tr.tr("visual.percent", percent), sx + 128, oy + 2, accent, false);
	}

	/** Les réglages du jeu sont écrits dans options.txt à la fermeture du menu */
	private boolean optionsChanged;

	private void gameToggle(G g, String id, String label, int x, int labelWidth, int y, boolean on, final Runnable flip) {
		text(g, label, x, y + 2, Theme.UI_TEXT, false);
		toggle(id, g, x + labelWidth, y, on, () -> {
			flip.run();
			optionsChanged = true;
		});
	}

	// ---------------------------------------------------------------- réglages d'un module

	private void drawSettings(G g, int mouseX, int mouseY, int x, int y, int w, int h, final HudModule module) {
		final ModuleSettings s = settings(module);
		button(g, mouseX, mouseY, x + PAD, y + PAD, 70, 18, Tr.tr("menu.back"), false, () -> editing = null);
		text(g, bold(module.name()), x + PAD + 80, y + PAD + 5, Theme.WHITE, false);
		toggle("enabled", g, x + w - PAD - 24, y + PAD + 3, s.enabled, () -> s.enabled = !s.enabled);
		String state = Tr.tr(s.enabled ? "menu.enabled" : "menu.disabled");
		int stateX = x + w - PAD - 30 - w(state);
		text(g, state, stateX, y + PAD + 5, Theme.UI_MUTED, false);
		String reset = Tr.tr("menu.reset");
		int resetW = w(reset) + 14;
		button(g, mouseX, mouseY, stateX - 10 - resetW, y + PAD, resetW, 18, reset, false, () -> AloriaHud.config().reset(module));

		int top = y + PAD + 30;
		int bottom = y + h - PAD;
		int previewW = (w - PAD * 3) / 3;
		round(g, x + PAD, top, previewW, bottom - top, Theme.UI_INSET);
		roundOutline(g, x + PAD, top, previewW, bottom - top, Theme.UI_LINE);
		int pickerH = module.placeable() && module.fixedAnchor() == null ? 40 : 0;
		drawPreview(g, module, s, x + PAD + 8, top + 8, previewW - 16, bottom - top - 24 - pickerH);
		String hint = module.hint();
		if (hint != null) centered(g, wrap(hint, previewW - 8, 1).get(0), x + PAD + previewW / 2, bottom - 12 - pickerH, Theme.UI_MUTED);
		if (pickerH > 0) drawAnchorPicker(g, mouseX, mouseY, x + PAD + 6, bottom - pickerH, previewW - 12, module, s);

		int ox = x + PAD * 2 + previewW;
		int ow = x + w - PAD - ox;
		int cx = ox + 58;
		int cw = ow - 58;
		optionsScroll = Draw.clamp(optionsScroll, 0, Math.max(0, optionRows() * ROW_H - (bottom - top)));
		int oy = top + 4 - optionsScroll;

		g.enableScissor(ox - 2, top, ox + ow + 2, bottom);
		clip(top, bottom);

		label(g, Tr.tr("edit.size"), ox, oy);
		slider(g, mouseX, mouseY, "slider", cx, oy, cw - 32, (s.scale - 0.5f) / 2.5f,
			t -> s.scale = Math.round((0.5 + t * 2.5) * 10) / 10f);
		text(g, String.format("%.1fx", s.scale), ox + ow - 26, oy + 2, accent, false);
		oy += ROW_H;

		// Élément du jeu : seule la taille se règle ici, la place dans la disposition
		if (!module.styled()) {
			for (String line : wrap(Tr.tr("game.element.layoutHint"), ow, 3)) {
				text(g, line, ox, oy + 2, Theme.UI_MUTED, false);
				oy += 10;
			}
			unclip();
			g.disableScissor();
			return;
		}

		label(g, Tr.tr("edit.text"), ox, oy);
		final GlobalSettings global = AloriaHud.config().global();
		if (global.sameTextColor && !s.ownStyle) {
			int swatchEnd = swatch(g, mouseX, mouseY, "pick:text", cx, oy - 2, global.textColor,
				() -> openPicker(new Picker(Tr.tr("picker.sharedText"), () -> global.textColor, c -> global.textColor = c, false)));
			text(g, Tr.tr("edit.shared"), swatchEnd + 5, oy + 2, Theme.UI_MUTED, false);
		} else {
			swatch(g, mouseX, mouseY, "pick:text", cx, oy - 2, s.color,
				() -> openPicker(new Picker(Tr.tr("picker.text"), () -> s.color, c -> s.color = c, false)));
		}
		toggle("shadow", g, ox + ow - 24, oy, s.shadow, () -> s.shadow = !s.shadow);
		String shadow = Tr.tr("edit.shadow");
		text(g, shadow, ox + ow - 30 - w(shadow), oy + 2, Theme.UI_MUTED, false);
		oy += ROW_H;

		label(g, Tr.tr("edit.background"), ox, oy);
		swatch(g, mouseX, mouseY, "pick:bg", cx, oy - 2, 0xFF000000 | s.bgColor,
			() -> openPicker(new Picker(Tr.tr("picker.background"), () -> 0xFF000000 | s.bgColor, c -> s.bgColor = c & 0xFFFFFF, false)));
		toggle("background", g, ox + ow - 24, oy, s.background, () -> s.background = !s.background);
		oy += ROW_H;

		label(g, Tr.tr("edit.opacity"), ox, oy);
		slider(g, mouseX, mouseY, "opacity", cx, oy, cw - 32, s.opacity / 100f, t -> s.opacity = Math.round(t * 20) * 5);
		text(g, s.opacity + "%", ox + ow - 26, oy + 2, accent, false);
		oy += ROW_H;

		label(g, Tr.tr("edit.border"), ox, oy);
		swatch(g, mouseX, mouseY, "pick:border", cx, oy - 2, s.borderColor,
			() -> openPicker(new Picker(Tr.tr("picker.border"), () -> s.borderColor, c -> s.borderColor = c, true)));
		buttonWithId("border:-", g, mouseX, mouseY, ox + ow - 62, oy - 2, 16, 16, "-", false, () -> s.borderWidth = Math.max(0, s.borderWidth - 1));
		centered(g, s.borderWidth + " px", ox + ow - 31, oy + 2, accent);
		buttonWithId("border:+", g, mouseX, mouseY, ox + ow - 16, oy - 2, 16, 16, "+", false, () -> s.borderWidth = Math.min(3, s.borderWidth + 1));
		oy += ROW_H;

		label(g, Tr.tr("edit.hideInChat"), ox, oy);
		toggle("hideInChat", g, ox + ow - 24, oy, s.hideInChat, () -> s.hideInChat = !s.hideInChat);
		oy += ROW_H;

		// Option propre au module Coordonnées
		if (hasBiomeOption()) {
			label(g, Tr.tr("edit.showBiome"), ox, oy);
			toggle("showBiome", g, ox + ow - 24, oy, s.showBiome, () -> s.showBiome = !s.showBiome);
			oy += ROW_H;
		}

		label(g, Tr.tr("edit.ownStyle"), ox, oy);
		toggle("ownStyle", g, ox + ow - 24, oy, s.ownStyle, () -> s.ownStyle = !s.ownStyle);
		oy += ROW_H;

		boolean justApplied = System.currentTimeMillis() - appliedAt < 2000;
		buttonWithId("apply-all", g, mouseX, mouseY, ox, oy - 2, ow, 16,
			Tr.tr(justApplied ? "edit.applied" : "edit.applyAll"), false, () -> {
				for (HudModule m : AloriaHud.modules()) {
					ModuleSettings o = settings(m);
					if (m != module && o.ownStyle) continue;
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

		int content = optionRows() * ROW_H;
		int view = bottom - top;
		if (content > view) {
			int trackX = x + w - 6;
			round(g, trackX, top, 3, view, Theme.UI_TRACK);
			int thumbH = Math.max(12, view * view / content);
			int thumbY = top + Math.round((view - thumbH) * optionsScroll / (float) (content - view));
			round(g, trackX, thumbY, 3, thumbH, accent);
		}
	}

	/** Côté d'où le module s'agrandit : neuf points (le losange est celui choisi) et « Automatique » */
	private void drawAnchorPicker(final G g, int mouseX, int mouseY, int x, int y, int w, final HudModule module, final ModuleSettings s) {
		g.fill(x, y, x + w, y + 1, Theme.UI_LINE);
		text(g, Tr.tr("edit.anchor"), x, y + 6, Theme.UI_MUTED, false);
		int gw = 30;
		int gh = 14;
		int gx = x + 3;
		int gy = y + 19;
		roundOutline(g, gx - 3, gy - 3, gw + 7, gh + 7, Theme.UI_LINE);
		String active = s.effectiveAnchor();
		boolean auto = ModuleSettings.AUTO.equals(s.anchor);
		for (final String a : ModuleSettings.ANCHORS) {
			int px = gx + Math.round(ModuleSettings.fx(a) * gw);
			int py = gy + Math.round(ModuleSettings.fy(a) * gh);
			boolean hover = hovered(mouseX, mouseY, px - 4, py - 4, 9, 9);
			if (a.equals(active)) {
				int color = auto ? 0xFFFF9AA4 : Theme.CAT_PVP;
				for (int i = -3; i <= 3; i++) g.fill(px - (3 - Math.abs(i)), py + i, px + (3 - Math.abs(i)) + 1, py + i + 1, color);
			} else g.fill(px - 1, py - 1, px + 2, py + 2, hover ? Theme.CAT_PVP : Theme.UI_MUTED);
			onClick("anchor:" + a, px - 4, py - 4, 9, 9, () -> setAnchor(g, module, s, a));
		}
		String autoLabel = Tr.tr("layout.autoShort");
		int aw = Math.min(w - gw - 14, w(autoLabel) + 12);
		int saved = accent;
		accent = Theme.CAT_PVP;
		buttonWithId("anchor:auto", g, mouseX, mouseY, x + w - aw, gy - 1, aw, 16, autoLabel, auto, () -> setAnchor(g, module, s, ModuleSettings.AUTO));
		accent = saved;
	}

	/** Change le point d'ancrage sans déplacer le module à l'écran */
	private void setAnchor(G g, HudModule module, ModuleSettings s, String anchor) {
		fr.alykell.aloria.hud.HudRenderer.Bounds b = fr.alykell.aloria.hud.HudRenderer.bounds(client, g, module, s, width, height, false);
		s.setAnchor(anchor, b.x, b.y, b.width, b.height, width, height);
	}

	private void label(G g, String label, int x, int y) {
		text(g, label, x, y + 2, Theme.UI_TEXT, false);
	}

	/** Pastille de couleur + code hexadécimal ; un clic ouvre le sélecteur. Renvoie sa fin. */
	private int swatch(G g, int mouseX, int mouseY, String id, int x, int y, int argb, Runnable open) {
		int w = 18 + 6 + w("#FFFFFF") + 8;
		boolean hover = hovered(mouseX, mouseY, x, y, w, 16);
		round(g, x, y, w, 16, hover ? Theme.UI_CARD_HOVER : Theme.UI_CARD);
		roundOutline(g, x, y, w, 16, hover ? Theme.mix(Theme.UI_LINE, accent, 0.6f) : Theme.UI_LINE);
		checker(g, x + 3, y + 3, 18, 10);
		g.fill(x + 3, y + 3, x + 21, y + 13, argb);
		text(g, Colors.hex(argb), x + 26, y + 4, Theme.UI_TEXT, false);
		onClick(id, x, y, w, 16, open);
		return x + w;
	}

	/** Damier gris, pour voir la transparence d'une couleur */
	private static void checker(G g, int x, int y, int w, int h) {
		for (int i = 0; i < w; i += 3) {
			for (int j = 0; j < h; j += 3) {
				g.fill(x + i, y + j, Math.min(x + w, x + i + 3), Math.min(y + h, y + j + 3), ((i + j) / 3) % 2 == 0 ? 0xFF9A9A9A : 0xFFD0D0D0);
			}
		}
	}

	// ---------------------------------------------------------------- sélecteur de couleur

	private void drawPicker(G g, int mouseX, int mouseY, int wx, int wy, int ww, int wh, final Picker p) {
		onClick("picker:close", 0, 0, width, height, this::closePicker);
		round(g, wx, wy, ww, wh, 0x90000000);

		int sw = 120;
		int sh = 70;
		int pw = sw + 20 + 46;
		int ph = 22 + sh + 6 + 8 + 8 + (p.alpha ? 12 : 0) + 20 + 22;
		int px = wx + (ww - pw) / 2;
		int py = wy + (wh - ph) / 2;
		round(g, px, py, pw, ph, 0xF50C0F1A);
		roundOutline(g, px, py, pw, ph, Theme.mix(Theme.UI_LINE, accent, 0.6f));
		onClick("picker:panel", px, py, pw, ph, () -> {
		});
		text(g, bold(p.title), px + 10, py + 8, Theme.WHITE, false);

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

		int rx = sx + sw + 10;
		for (int i = 0; i < Theme.PALETTE.length; i++) {
			final int c = Theme.PALETTE[i];
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

		String recentLabel = Tr.tr("picker.recent");
		text(g, recentLabel, sx, by + 3, Theme.UI_MUTED, false);
		int rcx = sx + w(recentLabel) + 8;
		List<Integer> recent = AloriaHud.config().global().recentColors;
		if (recent == null || recent.isEmpty()) text(g, Tr.tr("picker.none"), rcx, by + 3, 0x80FFFFFF, false);
		else {
			for (int i = 0; i < recent.size(); i++) {
				final int c = recent.get(i);
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

		checker(g, sx, by, 18, 12);
		g.fill(sx, by, sx + 18, by + 12, p.argb());
		text(g, "#", sx + 24, by + 2, Theme.UI_TEXT, false);
		if (hexBox != null) {
			round(g, sx + 31, by - 2, 50, 16, Theme.UI_INSET);
			roundOutline(g, sx + 31, by - 2, 50, 16, hexBox.isFocused() ? accent : Theme.UI_LINE);
			hexBox.x = sx + 35;
			hexBox.y = by + 2;
			hexBox.render();
		}
		if (p.alpha) text(g, Math.round(p.a / 2.55f) + " %", sx + 86, by + 2, Theme.UI_TEXT, false);
		button(g, mouseX, mouseY, px + pw - 46, by - 2, 36, 16, "OK", true, this::closePicker);
	}

	private void openPicker(Picker p) {
		picker = p;
		hexBox = new TextFieldWidget(0, textRenderer, 0, 0, 44, 10);
		hexBox.setHasBorder(false);
		hexBox.setMaxLength(6);
		hexBox.setEditableColor(Theme.WHITE);
		hexBox.setFocused(true);
		syncHex();
	}

	/** Pour l'auto-test : le champ du code couleur du sélecteur ouvert */
	public TextFieldWidget hexBoxForTest() {
		return hexBox;
	}

	private void syncHex() {
		if (hexBox == null || picker == null) return;
		hexBox.setText(String.format("%06X", picker.argb() & 0xFFFFFF));
		hexBefore = hexBox.getText();
	}

	/** Six chiffres hexadécimaux tapés : la couleur s'applique aussitôt */
	private void hexChanged() {
		if (hexBox == null || picker == null) return;
		String v = hexBox.getText();
		String clean = v.replaceAll("[^0-9a-fA-F]", "");
		if (!clean.equals(v)) hexBox.setText(clean);
		hexBefore = hexBox.getText();
		if (clean.length() != 6) return;
		picker.load((picker.a << 24) | Integer.parseInt(clean, 16));
		picker.apply();
	}

	private void closePicker() {
		if (picker != null && picker.argb() != (picker.alpha ? picker.initial : picker.initial | 0xFF000000)) {
			AloriaHud.config().global().addRecentColor(picker.argb());
		}
		picker = null;
		hexBox = null;
	}

	// ---------------------------------------------------------------- souris et clavier

	@Override
	protected void mouseClicked(int mouseX, int mouseY, int button) {
		if (hexBox != null) hexBox.mouseClicked(mouseX, mouseY, button);
		if (search != null && searchVisible) search.mouseClicked(mouseX, mouseY, button);
		super.mouseClicked(mouseX, mouseY, button);
	}

	@Override
	protected void typed(char id, int code) {
		if (hexBox != null && hexBox.isFocused()) {
			hexBox.keyPressed(id, code);
			if (!hexBox.getText().equals(hexBefore)) hexChanged();
		} else if (search != null && search.isFocused()) {
			search.keyPressed(id, code);
			if (!search.getText().equals(query)) {
				query = search.getText();
				scroll = 0;
			}
		}
	}

	@Override
	public void tick() {
		if (hexBox != null) hexBox.tick();
		if (search != null) search.tick();
	}

	@Override
	protected void scrolled(int mouseX, int mouseY, int amount) {
		if (picker != null) return;
		if (editing != null) optionsScroll = Math.max(0, optionsScroll - amount * 16);
		else scroll = Draw.clamp(scroll - amount * 20, 0, Math.max(0, gridContent - gridView));
	}

	/** Pour l'auto-test : défilement comme à la molette */
	public void scrollForTest(int amount) {
		scrolled(0, 0, amount);
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
		// Quitter le menu applique les packs cochés (une seule fois)
		applyPacks();
		AloriaHud.config().save();
		if (optionsChanged) client.options.save();
	}
}
