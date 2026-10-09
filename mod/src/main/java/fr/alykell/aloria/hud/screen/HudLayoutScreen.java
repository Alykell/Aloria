package fr.alykell.aloria.hud.screen;

import com.mojang.blaze3d.platform.InputConstants;
import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.HudRenderer;
import fr.alykell.aloria.hud.HudRenderer.Bounds;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import net.minecraft.client.gui.GuiGraphicsExtractor;
//#if MC >= 12109
import net.minecraft.client.input.KeyEvent;
//#endif
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * Disposition du HUD : on glisse les modules à la souris (aimantés aux bords, au centre et
 * aux autres modules), la molette change leur taille, clic droit ouvre leurs réglages.
 */
public class HudLayoutScreen extends AloriaScreen {
	private static final int SNAP = 6;

	private final List<int[]> guides = new ArrayList<>();
	private @Nullable HudModule selected;
	private @Nullable HudModule dragging;
	private double dragOffsetX;
	private double dragOffsetY;

	public HudLayoutScreen(HudMenuScreen menu) {
		super(Component.literal(Tr.tr("layout.title")), menu);
	}

	private ModuleSettings settings(HudModule m) {
		return AloriaHud.config().get(m);
	}

	/** Modules visibles dans la disposition : actifs et ayant une place à l'écran */
	private boolean placed(HudModule m) {
		return m.placeable() && settings(m).enabled;
	}

	private Bounds bounds(HudModule m) {
		return HudRenderer.bounds(minecraft, m, settings(m), width, height, true);
	}

	private @Nullable HudModule moduleAt(double x, double y) {
		List<HudModule> modules = AloriaHud.modules();
		for (int i = modules.size() - 1; i >= 0; i--) {
			HudModule m = modules.get(i);
			if (placed(m) && bounds(m).contains(x, y)) return m;
		}
		return null;
	}

	@Override
	protected void background(GuiGraphicsExtractor g, int mouseX, int mouseY) {
		g.fill(0, 0, width, height, 0x30000000);
		// Repères discrets : centre de l'écran
		g.verticalLine(width / 2, 0, height, 0x14FFFFFF);
		g.horizontalLine(0, width, height / 2, 0x14FFFFFF);
	}

	@Override
	protected void draw(GuiGraphicsExtractor g, int mouseX, int mouseY) {
		HudModule hovered = dragging != null ? dragging : moduleAt(mouseX, mouseY);

		for (HudModule module : AloriaHud.modules()) {
			ModuleSettings s = settings(module);
			if (!placed(module)) continue;
			Bounds b = bounds(module);
			if (module == hovered || module == selected) round(g, b.x() - 2, b.y() - 2, b.width() + 4, b.height() + 4, 0x205CC8E0);
			HudRenderer.drawModule(g, minecraft, module, s, b, true);
			int outline = module == selected ? Theme.LAGOON : module == hovered ? 0xB0FFFFFF : 0x40FFFFFF;
			roundOutline(g, b.x() - 2, b.y() - 2, b.width() + 4, b.height() + 4, outline);
		}

		for (int[] guide : guides) {
			if (guide[0] == 0) g.verticalLine(guide[1], 0, height, Theme.LAGOON);
			else g.horizontalLine(0, width, guide[1], Theme.LAGOON);
		}

		if (hovered != null && dragging == null) {
			Bounds b = bounds(hovered);
			String name = hovered.name();
			int tw = w(name) + 8;
			int ty = b.y() > 16 ? b.y() - 15 : b.y() + b.height() + 4;
			round(g, b.x() - 2, ty, tw, 12, Theme.WINDOW);
			text(g, name, b.x() + 2, ty + 2, Theme.LAGOON, false);
		}

		// Barre d'outils en bas au centre, au-dessus de la barre d'objets (les modules sont rarement là)
		String hint = Tr.tr("layout.hint");
		int barW = w(hint) + 24 + 70;
		int bx = (width - barW) / 2;
		int by = height - 70;
		round(g, bx, by, barW, 22, Theme.WINDOW);
		roundOutline(g, bx, by, barW, 22, Theme.BORDER);
		text(g, hint, bx + 10, by + 7, Theme.FOAM, false);
		button(g, mouseX, mouseY, bx + barW - 68, by + 2, 64, 18, Tr.tr("layout.done"), true, this::onClose);
	}

	@Override
	protected boolean clicked(MouseButtonEvent event) {
		HudModule module = moduleAt(event.x(), event.y());
		selected = module;
		if (module == null) return true;
		if (event.button() == InputConstants.MOUSE_BUTTON_RIGHT) {
			minecraft.gui.setScreen(new HudMenuScreen(((HudMenuScreen) parent).parentScreen(), module));
			return true;
		}
		if (event.button() == InputConstants.MOUSE_BUTTON_LEFT) {
			Bounds b = bounds(module);
			dragging = module;
			dragOffsetX = event.x() - b.x();
			dragOffsetY = event.y() - b.y();
		}
		return true;
	}

	@Override
	//#if MC >= 12109
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
	//#else
	//$$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$$ 	Click event = new Click(mouseX, mouseY, button);
	//#endif
		if (dragging == null) return false;
		Bounds b = bounds(dragging);
		guides.clear();
		int nx = snapX((int) Math.round(event.x() - dragOffsetX), b.width());
		int ny = snapY((int) Math.round(event.y() - dragOffsetY), b.height());
		move(dragging, nx, ny, b);
		return true;
	}

	private void move(HudModule module, int x, int y, Bounds b) {
		ModuleSettings s = settings(module);
		int left = Mth.clamp(x, 0, Math.max(0, width - b.width()));
		s.x = (float) (module.centered() ? left + b.width() / 2.0 : left) / width;
		s.y = (float) Mth.clamp(y, 0, Math.max(0, height - b.height())) / height;
	}

	private int snapX(int x, int w) {
		List<int[]> targets = new ArrayList<>();
		targets.add(new int[] {HudRenderer.MARGIN, HudRenderer.MARGIN});
		targets.add(new int[] {width - w - HudRenderer.MARGIN, width - HudRenderer.MARGIN});
		targets.add(new int[] {(width - w) / 2, width / 2});
		for (HudModule other : AloriaHud.modules()) {
			if (other == dragging || !placed(other)) continue;
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
		targets.add(new int[] {HudRenderer.MARGIN, HudRenderer.MARGIN});
		targets.add(new int[] {height - h - HudRenderer.MARGIN, height - HudRenderer.MARGIN});
		targets.add(new int[] {(height - h) / 2, height / 2});
		for (HudModule other : AloriaHud.modules()) {
			if (other == dragging || !placed(other)) continue;
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
	//#if MC >= 12109
	public boolean mouseReleased(MouseButtonEvent event) {
	//#else
	//$$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//#endif
		dragging = null;
		guides.clear();
		return true;
	}

	@Override
	//#if MC >= 12002
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
	//#else
	//$$ public boolean mouseScrolled(double x, double y, double scrollY) {
	//#endif
		HudModule module = moduleAt(x, y);
		if (module == null) return false;
		ModuleSettings s = settings(module);
		s.scale = Mth.clamp(Math.round((s.scale + (float) Math.signum(scrollY) * 0.1f) * 10) / 10f, 0.5f, 3f);
		selected = module;
		return true;
	}

	@Override
	//#if MC >= 12109
	public boolean keyPressed(KeyEvent event) {
		int key = event.key();
		boolean shift = event.hasShiftDown();
	//#else
	//$$ public boolean keyPressed(int key, int scanCode, int modifiers) {
	//$$ 	boolean shift = hasShiftDown();
	//#endif
		// Flèches : déplacement précis du module sélectionné (Maj = 10 pixels)
		if (selected != null) {
			int step = shift ? 10 : 1;
			int dx = switch (key) {
				case InputConstants.KEY_RIGHT -> step;
				case InputConstants.KEY_LEFT -> -step;
				default -> 0;
			};
			int dy = switch (key) {
				case InputConstants.KEY_DOWN -> step;
				case InputConstants.KEY_UP -> -step;
				default -> 0;
			};
			if (dx != 0 || dy != 0) {
				Bounds b = bounds(selected);
				move(selected, b.x() + dx, b.y() + dy, b);
				return true;
			}
		}
		//#if MC >= 12109
		return super.keyPressed(event);
		//#else
		//$$ return super.keyPressed(key, scanCode, modifiers);
		//#endif
	}

	@Override
	public void removed() {
		AloriaHud.config().save();
	}
}
