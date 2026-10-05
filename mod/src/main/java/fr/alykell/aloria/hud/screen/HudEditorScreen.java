package fr.alykell.aloria.hud.screen;

import com.mojang.blaze3d.platform.InputConstants;
import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.HudRenderer;
import fr.alykell.aloria.hud.HudRenderer.Bounds;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * Éditeur du HUD : les modules se déplacent à la souris (avec aimantation), la molette change
 * leur taille, et le panneau de droite permet de les activer et de régler leur apparence.
 */
public class HudEditorScreen extends Screen {
	private static final int PANEL_W = 170;
	private static final int ROW_H = 18;
	private static final int SNAP = 6;
	private static final int MARGIN = 4;

	private final @Nullable Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private final List<int[]> guides = new ArrayList<>();

	private boolean panelOpen = true;
	private @Nullable HudModule selected;
	private @Nullable HudModule dragging;
	private double dragOffsetX;
	private double dragOffsetY;

	/** Zone cliquable du panneau, recalculée à chaque image */
	private record Hit(int x, int y, int w, int h, Runnable action) {
		boolean contains(double px, double py) {
			return px >= x && px < x + w && py >= y && py < y + h;
		}
	}

	public HudEditorScreen(@Nullable Screen parent) {
		super(Component.literal("Aloria HUD"));
		this.parent = parent;
	}

	private ModuleSettings settings(HudModule module) {
		return AloriaHud.config().get(module);
	}

	private Bounds bounds(HudModule module) {
		return HudRenderer.bounds(minecraft, module, settings(module), width, height, true);
	}

	private int panelX() {
		return width - PANEL_W;
	}

	private boolean overPanel(double x, double y) {
		return panelOpen ? x >= panelX() : x >= width - 70 && y < 22;
	}

	private @Nullable HudModule moduleAt(double x, double y) {
		List<HudModule> modules = AloriaHud.modules();
		for (int i = modules.size() - 1; i >= 0; i--) {
			HudModule m = modules.get(i);
			if (settings(m).enabled && bounds(m).contains(x, y)) return m;
		}
		return null;
	}

	// ---------------------------------------------------------------- rendu

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		// Léger voile seulement : on garde le jeu visible pour placer les modules
		g.fill(0, 0, width, height, 0x38000000);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		hits.clear();
		HudModule hovered = dragging != null ? dragging : overPanel(mouseX, mouseY) ? null : moduleAt(mouseX, mouseY);

		for (HudModule module : AloriaHud.modules()) {
			ModuleSettings s = settings(module);
			if (!s.enabled) continue;
			Bounds b = bounds(module);
			HudRenderer.drawModule(g, minecraft, module, s, b, true);
			int outline = module == selected ? Theme.LAGOON : module == hovered ? 0xC0FFFFFF : 0x50FFFFFF;
			g.outline(b.x() - 1, b.y() - 1, b.width() + 2, b.height() + 2, outline);
			if (module == hovered && dragging == null) {
				g.text(font, module.name(), b.x(), Math.max(0, b.y() - 11), Theme.SAND, true);
			}
		}

		for (int[] guide : guides) {
			if (guide[0] == 0) g.verticalLine(guide[1], 0, height, Theme.withAlpha(Theme.LAGOON, 0xB0));
			else g.horizontalLine(0, width, guide[1], Theme.withAlpha(Theme.LAGOON, 0xB0));
		}

		if (panelOpen) extractPanel(g, mouseX, mouseY);
		else button(g, mouseX, mouseY, width - 70, 2, 68, 18, "☰ Modules", false, () -> panelOpen = true);

		super.extractRenderState(g, mouseX, mouseY, a);
	}

	private void extractPanel(GuiGraphicsExtractor g, int mouseX, int mouseY) {
		int x = panelX();
		g.fill(x, 0, width, height, Theme.PANEL);
		g.verticalLine(x, 0, height, Theme.withAlpha(Theme.LAGOON, 0x90));

		g.text(font, "✦ Aloria HUD", x + 10, 10, Theme.SAND, true);
		button(g, mouseX, mouseY, width - 22, 6, 16, 16, "»", false, () -> panelOpen = false);
		g.text(font, "Modules", x + 10, 28, Theme.TEXT_SOFT, false);

		int y = 40;
		for (HudModule module : AloriaHud.modules()) {
			ModuleSettings s = settings(module);
			boolean hover = mouseX >= x && mouseY >= y && mouseY < y + ROW_H;
			if (module == selected) g.fill(x + 4, y, width - 4, y + ROW_H, Theme.PANEL_ROW_SELECTED);
			else if (hover) g.fill(x + 4, y, width - 4, y + ROW_H, Theme.PANEL_ROW_HOVER);
			g.text(font, module.name(), x + 12, y + 5, s.enabled ? Theme.WHITE : Theme.TEXT_SOFT, false);
			toggle(g, width - 34, y + 4, s.enabled, () -> {
				s.enabled = !s.enabled;
				if (s.enabled) selected = module;
			});
			hits.add(new Hit(x + 4, y, PANEL_W - 44, ROW_H, () -> selected = module));
			y += ROW_H;
		}

		y += 8;
		g.horizontalLine(x + 10, width - 10, y, 0x40FFFFFF);
		y += 10;

		if (selected == null) {
			g.text(font, "Clique un module pour", x + 10, y, Theme.TEXT_SOFT, false);
			g.text(font, "régler son apparence.", x + 10, y + 11, Theme.TEXT_SOFT, false);
		} else {
			extractSettings(g, mouseX, mouseY, x, y, selected);
		}

		g.text(font, "Glisser : déplacer", x + 10, height - 56, Theme.TEXT_SOFT, false);
		g.text(font, "Molette : taille · Flèches", x + 10, height - 45, Theme.TEXT_SOFT, false);
		button(g, mouseX, mouseY, x + 10, height - 30, PANEL_W - 20, 20, "Terminé", true, this::onClose);
	}

	private void extractSettings(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, HudModule module) {
		ModuleSettings s = settings(module);
		g.text(font, module.name(), x + 10, y, Theme.SAND, true);
		y += 16;

		g.text(font, "Taille", x + 10, y + 4, Theme.WHITE, false);
		button(g, mouseX, mouseY, width - 78, y, 16, 16, "-", false, () -> s.scale = clampScale(s.scale - 0.1f));
		g.centeredText(font, String.format("%.1fx", s.scale), width - 47, y + 4, Theme.WHITE);
		button(g, mouseX, mouseY, width - 32, y, 16, 16, "+", false, () -> s.scale = clampScale(s.scale + 0.1f));
		y += 22;

		g.text(font, "Couleur", x + 10, y, Theme.WHITE, false);
		y += 12;
		int sx = x + 10;
		for (int color : Theme.PALETTE) {
			int cx = sx;
			g.fill(cx, y, cx + 14, y + 14, color);
			if (s.color == color) g.outline(cx - 2, y - 2, 18, 18, Theme.WHITE);
			hits.add(new Hit(cx, y, 14, 14, () -> s.color = color));
			sx += 19;
		}
		y += 22;

		g.text(font, "Fond", x + 10, y + 2, Theme.WHITE, false);
		toggle(g, width - 34, y, s.background, () -> s.background = !s.background);
		y += 18;
		g.text(font, "Ombre du texte", x + 10, y + 2, Theme.WHITE, false);
		toggle(g, width - 34, y, s.shadow, () -> s.shadow = !s.shadow);
		y += 22;

		button(g, mouseX, mouseY, x + 10, y, PANEL_W - 20, 18, "Réinitialiser", false, () -> AloriaHud.config().reset(module));
	}

	private void toggle(GuiGraphicsExtractor g, int x, int y, boolean on, Runnable action) {
		g.fill(x, y, x + 22, y + 10, on ? Theme.SEA : 0xFF3A5563);
		int knob = on ? x + 13 : x + 1;
		g.fill(knob, y + 1, knob + 8, y + 9, on ? Theme.FOAM : 0xFFB8C7CE);
		hits.add(new Hit(x - 2, y - 3, 26, 16, action));
	}

	private void button(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, int h, String label, boolean primary, Runnable action) {
		boolean hover = mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + h;
		int bg = primary ? (hover ? Theme.LAGOON : Theme.SEA) : (hover ? 0x601A9BC7 : 0x30FFFFFF);
		g.fill(x, y, x + w, y + h, bg);
		g.centeredText(font, label, x + w / 2, y + (h - 8) / 2, primary ? Theme.WHITE : Theme.FOAM);
		hits.add(new Hit(x, y, w, h, action));
	}

	private static float clampScale(float scale) {
		return Math.clamp(Math.round(scale * 10) / 10f, 0.5f, 3f);
	}

	// ---------------------------------------------------------------- souris et clavier

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		double x = event.x();
		double y = event.y();
		if (event.button() == 0) {
			for (int i = hits.size() - 1; i >= 0; i--) {
				if (hits.get(i).contains(x, y)) {
					hits.get(i).action().run();
					return true;
				}
			}
		}
		if (overPanel(x, y)) return true;

		HudModule module = moduleAt(x, y);
		selected = module;
		if (module != null && event.button() == 0) {
			Bounds b = bounds(module);
			dragging = module;
			dragOffsetX = x - b.x();
			dragOffsetY = y - b.y();
		}
		if (module != null && event.button() == 1) panelOpen = true;
		return true;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (dragging == null) return false;
		Bounds b = bounds(dragging);
		guides.clear();
		int nx = snapX((int) Math.round(event.x() - dragOffsetX), b.width());
		int ny = snapY((int) Math.round(event.y() - dragOffsetY), b.height());
		ModuleSettings s = settings(dragging);
		s.x = (float) Math.clamp(nx, 0, Math.max(0, width - b.width())) / width;
		s.y = (float) Math.clamp(ny, 0, Math.max(0, height - b.height())) / height;
		return true;
	}

	/** Aimante le module aux bords, au centre de l'écran et aux bords des autres modules. */
	private int snapX(int x, int w) {
		List<int[]> targets = new ArrayList<>();
		targets.add(new int[] {MARGIN, MARGIN});
		targets.add(new int[] {width - w - MARGIN, width - MARGIN});
		targets.add(new int[] {(width - w) / 2, width / 2});
		for (HudModule other : AloriaHud.modules()) {
			if (other == dragging || !settings(other).enabled) continue;
			Bounds o = bounds(other);
			targets.add(new int[] {o.x(), o.x()});
			targets.add(new int[] {o.x() + o.width() - w, o.x() + o.width()});
		}
		for (int[] t : targets) {
			if (Math.abs(x - t[0]) <= SNAP) {
				guides.add(new int[] {0, t[1]});
				return t[0];
			}
		}
		return x;
	}

	private int snapY(int y, int h) {
		List<int[]> targets = new ArrayList<>();
		targets.add(new int[] {MARGIN, MARGIN});
		targets.add(new int[] {height - h - MARGIN, height - MARGIN});
		targets.add(new int[] {(height - h) / 2, height / 2});
		for (HudModule other : AloriaHud.modules()) {
			if (other == dragging || !settings(other).enabled) continue;
			Bounds o = bounds(other);
			targets.add(new int[] {o.y() + o.height() + 2, o.y() + o.height() + 1});
			targets.add(new int[] {o.y() - h - 2, o.y() - 1});
			targets.add(new int[] {o.y(), o.y()});
		}
		for (int[] t : targets) {
			if (Math.abs(y - t[0]) <= SNAP) {
				guides.add(new int[] {1, t[1]});
				return t[0];
			}
		}
		return y;
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		dragging = null;
		guides.clear();
		return true;
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		HudModule module = overPanel(x, y) ? null : moduleAt(x, y);
		if (module == null) return false;
		ModuleSettings s = settings(module);
		s.scale = clampScale(s.scale + (float) Math.signum(scrollY) * 0.1f);
		selected = module;
		return true;
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		// Flèches : déplacement précis du module sélectionné (Maj = 10 pixels)
		if (selected != null) {
			int step = event.hasShiftDown() ? 10 : 1;
			int dx = 0;
			int dy = 0;
			switch (event.key()) {
				case InputConstants.KEY_RIGHT -> dx = step;
				case InputConstants.KEY_LEFT -> dx = -step;
				case InputConstants.KEY_DOWN -> dy = step;
				case InputConstants.KEY_UP -> dy = -step;
				default -> {
				}
			}
			if (dx != 0 || dy != 0) {
				Bounds b = bounds(selected);
				ModuleSettings s = settings(selected);
				s.x = (float) Math.clamp(b.x() + dx, 0, Math.max(0, width - b.width())) / width;
				s.y = (float) Math.clamp(b.y() + dy, 0, Math.max(0, height - b.height())) / height;
				return true;
			}
		}
		return super.keyPressed(event);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void removed() {
		AloriaHud.config().save();
	}

	@Override
	public void onClose() {
		minecraft.gui.setScreen(parent);
	}
}
