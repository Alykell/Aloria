package fr.alykell.aloria.hud.screen;

import com.mojang.blaze3d.platform.GlStateManager;
import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.Theme;
import net.minecraft.client.gui.screen.Screen;
import org.lwjgl.input.Mouse;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Base des écrans Aloria en 1.8.9 (même fonctionnement que le mod moderne) : dessin maison et zones cliquables
 * enregistrées pendant le rendu, puis testées au clic ; zones « glissables » (curseurs, sélecteur de couleur).
 */
public abstract class AloriaScreen extends Screen {
	protected final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private final List<Hit> pending = new ArrayList<>();
	private final Map<String, Drag> drags = new HashMap<>();
	private String dragging;
	/** Zone visible pour les clics (contenu qui défile) : en dehors, les zones ne sont pas cliquables */
	private int clipTop = Integer.MIN_VALUE;
	private int clipBottom = Integer.MAX_VALUE;
	private double lastClickX;
	private double lastClickY;
	private int frame;

	/** id : nom stable de la zone, utilisé par l'auto-test */
	protected static final class Hit {
		final String id;
		final int x;
		final int y;
		final int w;
		final int h;
		final Runnable action;

		Hit(String id, int x, int y, int w, int h, Runnable action) {
			this.id = id;
			this.x = x;
			this.y = y;
			this.w = w;
			this.h = h;
			this.action = action;
		}

		boolean contains(double px, double py) {
			return px >= x && px < x + w && py >= y && py < y + h;
		}
	}

	/** Zone glissable : la position de la souris y est convertie en valeurs de 0 à 1 */
	private static final class Drag {
		final int x;
		final int y;
		final int w;
		final int h;
		final DragHandler handler;

		Drag(int x, int y, int w, int h, DragHandler handler) {
			this.x = x;
			this.y = y;
			this.w = w;
			this.h = h;
			this.handler = handler;
		}

		void apply(double mx, double my) {
			float fx = (float) Draw.clamp((mx - x) / Math.max(1, w - 1), 0, 1);
			float fy = (float) Draw.clamp((my - y) / Math.max(1, h - 1), 0, 1);
			handler.update(fx, fy);
		}
	}

	protected interface DragHandler {
		void update(float fx, float fy);
	}

	/** Valeur choisie avec un curseur, entre 0 et 1 */
	protected interface ValueSetter {
		void accept(float t);
	}

	protected AloriaScreen(Screen parent) {
		this.parent = parent;
	}

	// ---------------------------------------------------------------- zones cliquables

	protected void onClick(String id, int x, int y, int w, int h, Runnable action) {
		int y0 = Math.max(y, clipTop);
		int y1 = Math.min(y + h, clipBottom);
		if (y1 > y0) pending.add(new Hit(id, x, y0, w, y1 - y0, action));
	}

	protected void clip(int top, int bottom) {
		clipTop = top;
		clipBottom = bottom;
	}

	protected void unclip() {
		clipTop = Integer.MIN_VALUE;
		clipBottom = Integer.MAX_VALUE;
	}

	protected void onDrag(String id, int x, int y, int w, int h, DragHandler handler) {
		final Drag drag = new Drag(x, y, w, h, handler);
		drags.put(id, drag);
		onClick(id, x, y, w, h, () -> {
			dragging = id;
			drag.apply(lastClickX, lastClickY);
		});
	}

	protected boolean isDragging(String id) {
		return id.equals(dragging);
	}

	/** Centre d'une zone cliquable, ou null si absente de l'image courante (auto-test) */
	public int[] hitCenter(String id) {
		for (Hit hit : hits) {
			if (hit.id.equals(id)) return new int[] {hit.x + hit.w / 2, hit.y + hit.h / 2};
		}
		return null;
	}

	public int frame() {
		return frame;
	}

	/** Auto-test : appui du bouton gauche à une position (début d'un glisser) */
	public void clickForTestAt(int x, int y) {
		mouseClicked(x, y, 0);
	}

	/** Auto-test : déclenche une zone cliquable par son nom, comme un clic au centre (faux si absente) */
	public boolean clickForTest(String id) {
		int[] c = hitCenter(id);
		if (c == null) return false;
		mouseClicked(c[0], c[1], 0);
		mouseReleased(c[0], c[1], 0);
		return true;
	}

	@Override
	public final void render(int mouseX, int mouseY, float delta) {
		G g = new G();
		GlStateManager.enableBlend();
		background(g, mouseX, mouseY);
		pending.clear();
		drags.clear();
		unclip();
		draw(g, mouseX, mouseY);
		unclip();
		// Les zones de l'image précédente restent valides jusqu'à ce que celle-ci soit complète
		hits.clear();
		hits.addAll(pending);
		frame++;
		super.render(mouseX, mouseY, delta);
		GlStateManager.color(1, 1, 1, 1);
	}

	protected abstract void draw(G g, int mouseX, int mouseY);

	/** Fond derrière l'écran (par défaut : voile sombre) */
	protected void background(G g, int mouseX, int mouseY) {
		g.fill(0, 0, width, height, 0x66000000);
	}

	// ---------------------------------------------------------------- souris et clavier

	@Override
	protected void mouseClicked(int mouseX, int mouseY, int button) {
		if (button == 0) {
			for (int i = hits.size() - 1; i >= 0; i--) {
				Hit hit = hits.get(i);
				if (hit.contains(mouseX, mouseY)) {
					lastClickX = mouseX;
					lastClickY = mouseY;
					hit.action.run();
					return;
				}
			}
		}
		if (!clicked(mouseX, mouseY, button)) super.mouseClicked(mouseX, mouseY, button);
	}

	/** Clic hors des zones (0 = gauche, 1 = droit en 1.8.9) */
	protected boolean clicked(int mouseX, int mouseY, int button) {
		return false;
	}

	@Override
	protected void mouseDragged(int mouseX, int mouseY, int button, long time) {
		Drag drag = dragging == null ? null : drags.get(dragging);
		if (drag != null) drag.apply(mouseX, mouseY);
		else dragged(mouseX, mouseY);
	}

	/** Glisser hors des zones glissables (éditeur de disposition) */
	protected void dragged(int mouseX, int mouseY) {
	}

	@Override
	protected void mouseReleased(int mouseX, int mouseY, int button) {
		dragging = null;
		released();
	}

	protected void released() {
	}

	/** Molette : valeur positive vers le haut */
	protected void scrolled(int mouseX, int mouseY, int amount) {
	}

	@Override
	public void handleMouse() {
		super.handleMouse();
		int wheel = Mouse.getEventDWheel();
		if (wheel != 0) {
			int mx = Mouse.getEventX() * width / client.width;
			int my = height - Mouse.getEventY() * height / client.height - 1;
			scrolled(mx, my, Integer.signum(wheel));
		}
	}

	@Override
	protected void keyPressed(char id, int code) {
		if (code == 1) onClose();
		else typed(id, code);
	}

	/** Touche autre qu'Échap */
	protected void typed(char id, int code) {
	}

	/** Échap : retour à l'écran précédent */
	public void onClose() {
		client.setScreen(parent);
	}

	@Override
	public boolean shouldPauseGame() {
		return false;
	}

	// ---------------------------------------------------------------- dessin

	protected static boolean hovered(int mouseX, int mouseY, int x, int y, int w, int h) {
		return mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + h;
	}

	protected static void round(G g, int x, int y, int w, int h, int color) {
		Draw.round(g, x, y, w, h, color);
	}

	protected static void roundOutline(G g, int x, int y, int w, int h, int color) {
		Draw.roundOutline(g, x, y, w, h, color);
	}

	/** Texte en gras (code de formatage de la 1.8.9) */
	protected static String bold(String text) {
		return "§l" + text;
	}

	protected void text(G g, String text, int x, int y, int color, boolean shadow) {
		g.text(text, x, y, color, shadow);
	}

	protected void centered(G g, String text, int x, int y, int color) {
		g.text(text, x - g.textWidth(text) / 2, y, color, false);
	}

	protected int w(String text) {
		return textRenderer.getStringWidth(text);
	}

	/** Bouton plat ; « accent » = turquoise plein */
	protected void button(G g, int mouseX, int mouseY, int x, int y, int w, int h, String label, boolean accent, Runnable action) {
		buttonWithId("btn:" + label, g, mouseX, mouseY, x, y, w, h, label, accent, action);
	}

	protected void buttonWithId(String id, G g, int mouseX, int mouseY, int x, int y, int w, int h, String label, boolean accent, Runnable action) {
		boolean hover = hovered(mouseX, mouseY, x, y, w, h);
		int bg = accent ? (hover ? Theme.LAGOON : Theme.SEA) : (hover ? Theme.CARD_HOVER : Theme.CARD);
		round(g, x, y, w, h, bg);
		if (!accent) roundOutline(g, x, y, w, h, hover ? Theme.BORDER_HOVER : Theme.BORDER);
		centered(g, label, x + w / 2, y + (h - 8) / 2, accent || hover ? Theme.WHITE : Theme.FOAM);
		onClick(id, x, y, w, h, action);
	}

	/** Interrupteur on/off */
	protected void toggle(String id, G g, int x, int y, boolean on, Runnable action) {
		round(g, x, y, 24, 12, on ? Theme.SEA : 0xFF27465A);
		int knob = on ? x + 13 : x + 2;
		round(g, knob, y + 2, 9, 8, on ? Theme.WHITE : 0xFF9DB4C0);
		onClick(id, x - 2, y - 2, 28, 16, action);
	}

	/** Curseur horizontal ; t est la valeur entre 0 et 1 */
	protected void slider(G g, int mouseX, int mouseY, String id, int x, int y, int w, float t, ValueSetter set) {
		int knob = x + Math.round(Draw.clamp(t, 0f, 1f) * (w - 8));
		round(g, x, y + 4, w, 4, 0xC01B3A4B);
		round(g, x, y + 4, knob - x + 4, 4, Theme.SEA);
		boolean hover = isDragging(id) || hovered(mouseX, mouseY, knob, y, 8, 12);
		round(g, knob, y + 1, 8, 10, hover ? Theme.WHITE : Theme.FOAM);
		// La valeur suit le centre du bouton : on retire sa demi-largeur aux deux bouts
		onDrag(id, x, y - 2, w, 16, (fx, fy) -> set.accept(Draw.clamp((fx * (w - 1) - 4) / (w - 8), 0f, 1f)));
	}
}
