package fr.alykell.aloria.hud.screen;

import com.mojang.blaze3d.platform.InputConstants;
import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.Fonts;
import fr.alykell.aloria.hud.Theme;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleConsumer;

/**
 * Base des écrans Aloria : dessin maison (cadres arrondis, boutons) et zones cliquables
 * enregistrées pendant le rendu, puis testées au clic. Gère aussi les zones « glissables »
 * (curseurs, sélecteur de couleur) qui suivent la souris tant que le bouton est enfoncé.
 */
public abstract class AloriaScreen extends Screen {
	protected final @Nullable Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private final List<Hit> pending = new ArrayList<>();
	private final Map<String, Drag> drags = new HashMap<>();
	private @Nullable String dragging;
	/** Zone visible pour les clics (contenu qui défile) : en dehors, les zones ne sont pas cliquables */
	private int clipTop = Integer.MIN_VALUE;
	private int clipBottom = Integer.MAX_VALUE;

	/** id : nom stable de la zone, utilisé par l'auto-test */
	protected record Hit(String id, int x, int y, int w, int h, Runnable action) {
		boolean contains(double px, double py) {
			return px >= x && px < x + w && py >= y && py < y + h;
		}
	}

	/** Zone glissable : la position de la souris y est convertie en valeurs de 0 à 1 */
	private record Drag(int x, int y, int w, int h, DragHandler handler) {
		void apply(double mx, double my) {
			float fx = (float) Math.clamp((mx - x) / Math.max(1, w - 1), 0, 1);
			float fy = (float) Math.clamp((my - y) / Math.max(1, h - 1), 0, 1);
			handler.update(fx, fy);
		}
	}

	@FunctionalInterface
	protected interface DragHandler {
		void update(float fx, float fy);
	}

	protected AloriaScreen(Component title, @Nullable Screen parent) {
		super(title);
		this.parent = parent;
	}

	// ---------------------------------------------------------------- zones cliquables

	protected void onClick(String id, int x, int y, int w, int h, Runnable action) {
		int y0 = Math.max(y, clipTop);
		int y1 = Math.min(y + h, clipBottom);
		if (y1 > y0) pending.add(new Hit(id, x, y0, w, y1 - y0, action));
	}

	/** Limite les zones cliquables suivantes à une bande verticale (contenu qui défile) */
	protected void clip(int top, int bottom) {
		clipTop = top;
		clipBottom = bottom;
	}

	protected void unclip() {
		clipTop = Integer.MIN_VALUE;
		clipBottom = Integer.MAX_VALUE;
	}

	/** Zone glissable : un clic démarre le glisser et applique tout de suite la position */
	protected void onDrag(String id, int x, int y, int w, int h, DragHandler handler) {
		Drag drag = new Drag(x, y, w, h, handler);
		drags.put(id, drag);
		onClick(id, x, y, w, h, () -> {
			dragging = id;
			drag.apply(lastClickX, lastClickY);
		});
	}

	protected boolean isDragging(String id) {
		return id.equals(dragging);
	}

	/** Centre d'une zone cliquable (coordonnées de l'interface), ou null si absente de l'image courante */
	public int @Nullable [] hitCenter(String id) {
		for (Hit hit : hits) {
			if (hit.id().equals(id)) return new int[] {hit.x() + hit.w() / 2, hit.y() + hit.h() / 2};
		}
		return null;
	}

	private double lastClickX;
	private double lastClickY;
	private int frame;

	/** Nombre d'images dessinées : l'auto-test attend une image neuve après chaque clic */
	public int frame() {
		return frame;
	}

	@Override
	public final void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		pending.clear();
		drags.clear();
		unclip();
		draw(g, mouseX, mouseY);
		unclip();
		// Les zones de l'image précédente restent valides jusqu'à ce que celle-ci soit complète
		hits.clear();
		hits.addAll(pending);
		frame++;
		super.extractRenderState(g, mouseX, mouseY, a);
	}

	protected abstract void draw(GuiGraphicsExtractor g, int mouseX, int mouseY);

	//#if MC < 12109
	//$$ /** Avant 1.21.9, les clics arrivent en trois nombres : on les regroupe comme dans les versions récentes */
	//$$ public record Click(double x, double y, int button) {
	//$$ }
	//$$
	//#endif
	/** Clic gauche sur une zone enregistrée ; sinon laisse l'écran gérer */
	@Override
	//#if MC >= 12109
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		for (var child : children()) {
			if (child.isMouseOver(event.x(), event.y())) return super.mouseClicked(event, doubleClick);
		}
	//#else
	//$$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$$ 	Click event = new Click(mouseX, mouseY, button);
	//$$ 	for (var child : children()) {
	//$$ 		if (child.isMouseOver(event.x(), event.y())) return super.mouseClicked(mouseX, mouseY, button);
	//$$ 	}
	//#endif
		if (event.button() == InputConstants.MOUSE_BUTTON_LEFT) {
			for (int i = hits.size() - 1; i >= 0; i--) {
				Hit hit = hits.get(i);
				if (hit.contains(event.x(), event.y())) {
					lastClickX = event.x();
					lastClickY = event.y();
					hit.action().run();
					return true;
				}
			}
		}
		return clicked(event);
	}

	protected boolean clicked(MouseButtonEvent event) {
		return false;
	}

	@Override
	//#if MC >= 12109
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
	//#else
	//$$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$$ 	Click event = new Click(mouseX, mouseY, button);
	//#endif
		Drag drag = dragging == null ? null : drags.get(dragging);
		if (drag == null) return false;
		drag.apply(event.x(), event.y());
		return true;
	}

	@Override
	//#if MC >= 12109
	public boolean mouseReleased(MouseButtonEvent event) {
	//#else
	//$$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//#endif
		dragging = null;
		return true;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		g.fill(0, 0, width, height, 0x66000000);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void onClose() {
		minecraft.gui.setScreen(parent);
	}

	// ---------------------------------------------------------------- dessin

	protected static boolean hovered(int mouseX, int mouseY, int x, int y, int w, int h) {
		return mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + h;
	}

	protected static void round(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		Draw.round(g, x, y, w, h, color);
	}

	protected static void roundOutline(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		Draw.roundOutline(g, x, y, w, h, color);
	}

	protected static Component bold(String text) {
		return Fonts.bold(Fonts.menu(), text);
	}

	/** Texte dans la police des menus */
	protected void text(GuiGraphicsExtractor g, String text, int x, int y, int color, boolean shadow) {
		g.text(font, Fonts.text(Fonts.menu(), text), x, y, color, shadow);
	}

	protected void text(GuiGraphicsExtractor g, Component text, int x, int y, int color, boolean shadow) {
		g.text(font, text, x, y, color, shadow);
	}

	protected void centered(GuiGraphicsExtractor g, String text, int x, int y, int color) {
		g.centeredText(font, Fonts.text(Fonts.menu(), text), x, y, color);
	}

	protected int w(String text) {
		return font.width(Fonts.text(Fonts.menu(), text));
	}

	/** Bouton plat ; « accent » = turquoise plein */
	protected void button(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, int h, String label, boolean accent, Runnable action) {
		buttonWithId("btn:" + label, g, mouseX, mouseY, x, y, w, h, label, accent, action);
	}

	protected void buttonWithId(String id, GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, int h, String label, boolean accent, Runnable action) {
		boolean hover = hovered(mouseX, mouseY, x, y, w, h);
		int bg = accent ? (hover ? Theme.LAGOON : Theme.SEA) : (hover ? Theme.CARD_HOVER : Theme.CARD);
		round(g, x, y, w, h, bg);
		if (!accent) roundOutline(g, x, y, w, h, hover ? Theme.BORDER_HOVER : Theme.BORDER);
		centered(g, label, x + w / 2, y + (h - 8) / 2, accent || hover ? Theme.WHITE : Theme.FOAM);
		onClick(id, x, y, w, h, action);
	}

	/** Interrupteur on/off */
	protected void toggle(String id, GuiGraphicsExtractor g, int x, int y, boolean on, Runnable action) {
		round(g, x, y, 24, 12, on ? Theme.SEA : 0xFF27465A);
		int knob = on ? x + 13 : x + 2;
		round(g, knob, y + 2, 9, 8, on ? Theme.WHITE : 0xFF9DB4C0);
		onClick(id, x - 2, y - 2, 28, 16, action);
	}

	/** Curseur horizontal ; t est la valeur entre 0 et 1 */
	protected void slider(GuiGraphicsExtractor g, int mouseX, int mouseY, String id, int x, int y, int w, float t, DoubleConsumer set) {
		int knob = x + Math.round(Math.clamp(t, 0, 1) * (w - 8));
		round(g, x, y + 4, w, 4, 0xC01B3A4B);
		round(g, x, y + 4, knob - x + 4, 4, Theme.SEA);
		boolean hover = isDragging(id) || hovered(mouseX, mouseY, knob, y, 8, 12);
		round(g, knob, y + 1, 8, 10, hover ? Theme.WHITE : Theme.FOAM);
		// La valeur suit le centre du bouton : on retire sa demi-largeur aux deux bouts
		onDrag(id, x, y - 2, w, 16, (fx, fy) -> set.accept(Math.clamp((fx * (w - 1) - 4) / (w - 8), 0, 1)));
	}
}
