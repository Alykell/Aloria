package fr.alykell.aloria.hud.screen;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.HudRenderer;
import fr.alykell.aloria.hud.HudRenderer.Bounds;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import org.lwjgl.input.Keyboard;

import java.util.ArrayList;
import java.util.List;

/**
 * Disposition du HUD : on glisse les modules à la souris (aimantés aux bords, au centre et
 * aux autres modules), la molette change leur taille, clic droit ouvre leurs réglages.
 */
public class HudLayoutScreen extends AloriaScreen {
	private static final int SNAP = 6;

	private final List<int[]> guides = new ArrayList<>();
	private HudModule selected;
	private HudModule dragging;
	private double dragOffsetX;
	private double dragOffsetY;
	/** Dernier G de rendu (dimensions de l'écran et mesure du texte), pour les calculs hors rendu */
	private G lastG;

	public HudLayoutScreen(HudMenuScreen menu) {
		super(menu);
	}

	private ModuleSettings settings(HudModule m) {
		return AloriaHud.config().get(m);
	}

	private boolean placed(HudModule m) {
		return m.placeable() && settings(m).enabled;
	}

	private G g() {
		if (lastG == null) lastG = new G();
		return lastG;
	}

	private Bounds bounds(HudModule m) {
		return HudRenderer.bounds(client, g(), m, settings(m), width, height, true);
	}

	private HudModule moduleAt(double x, double y) {
		List<HudModule> modules = AloriaHud.modules();
		for (int i = modules.size() - 1; i >= 0; i--) {
			HudModule m = modules.get(i);
			if (placed(m) && bounds(m).contains(x, y)) return m;
		}
		return null;
	}

	@Override
	protected void background(G g, int mouseX, int mouseY) {
		g.fill(0, 0, width, height, 0x30000000);
		// Repères discrets : centre de l'écran
		g.verticalLine(width / 2, 0, height, 0x14FFFFFF);
		g.horizontalLine(0, width, height / 2, 0x14FFFFFF);
	}

	@Override
	protected void draw(G g, int mouseX, int mouseY) {
		lastG = g;
		HudModule hovered = dragging != null ? dragging : moduleAt(mouseX, mouseY);

		for (HudModule module : AloriaHud.modules()) {
			if (!placed(module)) continue;
			ModuleSettings s = settings(module);
			Bounds b = bounds(module);
			if (module == hovered || module == selected) round(g, b.x - 2, b.y - 2, b.width + 4, b.height + 4, 0x205CC8E0);
			HudRenderer.drawModule(g, client, module, s, b, true);
			int outline = module == selected ? Theme.LAGOON : module == hovered ? 0xB0FFFFFF : 0x40FFFFFF;
			roundOutline(g, b.x - 2, b.y - 2, b.width + 4, b.height + 4, outline);
		}

		for (int[] guide : guides) {
			if (guide[0] == 0) g.verticalLine(guide[1], 0, height, Theme.LAGOON);
			else g.horizontalLine(0, width, guide[1], Theme.LAGOON);
		}

		if (hovered != null && dragging == null) {
			Bounds b = bounds(hovered);
			String name = hovered.name();
			int tw = w(name) + 8;
			int ty = b.y > 16 ? b.y - 15 : b.y + b.height + 4;
			round(g, b.x - 2, ty, tw, 12, Theme.WINDOW);
			text(g, name, b.x + 2, ty + 2, Theme.LAGOON, false);
		}

		// Barre d'outils en bas au centre, au-dessus de la barre d'objets
		String hint = "Glisser : déplacer  ·  Molette : taille  ·  Clic droit : réglages";
		int barW = w(hint) + 24 + 70;
		int bx = (width - barW) / 2;
		int by = height - 70;
		round(g, bx, by, barW, 22, Theme.WINDOW);
		roundOutline(g, bx, by, barW, 22, Theme.BORDER);
		text(g, hint, bx + 10, by + 7, Theme.FOAM, false);
		button(g, mouseX, mouseY, bx + barW - 68, by + 2, 64, 18, "Terminé", true, this::onClose);
	}

	@Override
	protected boolean clicked(int mouseX, int mouseY, int button) {
		HudModule module = moduleAt(mouseX, mouseY);
		selected = module;
		if (module == null) return true;
		if (button == 1) {
			client.setScreen(new HudMenuScreen(((HudMenuScreen) parent).parentScreen(), module));
			return true;
		}
		if (button == 0) {
			Bounds b = bounds(module);
			dragging = module;
			dragOffsetX = mouseX - b.x;
			dragOffsetY = mouseY - b.y;
		}
		return true;
	}

	@Override
	protected void dragged(int mouseX, int mouseY) {
		if (dragging == null) return;
		Bounds b = bounds(dragging);
		guides.clear();
		int nx = snapX((int) Math.round(mouseX - dragOffsetX), b.width);
		int ny = snapY((int) Math.round(mouseY - dragOffsetY), b.height);
		move(dragging, nx, ny, b);
	}

	/** Pour l'auto-test : glisser comme à la souris */
	public void dragTo(int mouseX, int mouseY) {
		dragged(mouseX, mouseY);
	}

	private void move(HudModule module, int x, int y, Bounds b) {
		ModuleSettings s = settings(module);
		int left = Draw.clamp(x, 0, Math.max(0, width - b.width));
		s.x = (float) (module.centered() ? left + b.width / 2.0 : left) / width;
		s.y = (float) Draw.clamp(y, 0, Math.max(0, height - b.height)) / height;
	}

	private int snapX(int x, int w) {
		List<int[]> targets = new ArrayList<>();
		targets.add(new int[] {HudRenderer.MARGIN, HudRenderer.MARGIN});
		targets.add(new int[] {width - w - HudRenderer.MARGIN, width - HudRenderer.MARGIN});
		targets.add(new int[] {(width - w) / 2, width / 2});
		for (HudModule other : AloriaHud.modules()) {
			if (other == dragging || !placed(other)) continue;
			Bounds o = bounds(other);
			targets.add(new int[] {o.x, o.x});
			targets.add(new int[] {o.x + o.width - w, o.x + o.width});
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
		targets.add(new int[] {HudRenderer.MARGIN, HudRenderer.MARGIN});
		targets.add(new int[] {height - h - HudRenderer.MARGIN, height - HudRenderer.MARGIN});
		targets.add(new int[] {(height - h) / 2, height / 2});
		for (HudModule other : AloriaHud.modules()) {
			if (other == dragging || !placed(other)) continue;
			Bounds o = bounds(other);
			targets.add(new int[] {o.y + o.height + 2, o.y + o.height + 1});
			targets.add(new int[] {o.y - h - 2, o.y - 1});
			targets.add(new int[] {o.y, o.y});
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
	protected void released() {
		dragging = null;
		guides.clear();
	}

	@Override
	protected void scrolled(int mouseX, int mouseY, int amount) {
		HudModule module = moduleAt(mouseX, mouseY);
		if (module == null) return;
		ModuleSettings s = settings(module);
		s.scale = Draw.clamp(Math.round((s.scale + amount * 0.1f) * 10) / 10f, 0.5f, 3f);
		selected = module;
	}

	@Override
	protected void typed(char id, int key) {
		// Flèches : déplacement précis du module sélectionné (Maj = 10 pixels)
		if (selected == null) return;
		int step = hasShiftDown() ? 10 : 1;
		int dx = key == Keyboard.KEY_RIGHT ? step : key == Keyboard.KEY_LEFT ? -step : 0;
		int dy = key == Keyboard.KEY_DOWN ? step : key == Keyboard.KEY_UP ? -step : 0;
		if (dx != 0 || dy != 0) {
			Bounds b = bounds(selected);
			move(selected, b.x + dx, b.y + dy, b);
		}
	}

	@Override
	public void removed() {
		AloriaHud.config().save();
	}
}
