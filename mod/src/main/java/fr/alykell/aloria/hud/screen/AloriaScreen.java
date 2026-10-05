package fr.alykell.aloria.hud.screen;

import com.mojang.blaze3d.platform.InputConstants;
import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.Theme;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * Base des écrans Aloria : dessin maison (cadres arrondis, boutons) et zones cliquables
 * enregistrées pendant le rendu, puis testées au clic.
 */
public abstract class AloriaScreen extends Screen {
	protected final @Nullable Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private final List<Hit> pending = new ArrayList<>();
	/** Position du clic en cours, pour les actions qui en dépendent (curseurs) */
	protected double lastClickX;

	/** id : nom stable de la zone, utilisé par l'auto-test */
	protected record Hit(String id, int x, int y, int w, int h, Runnable action) {
		boolean contains(double px, double py) {
			return px >= x && px < x + w && py >= y && py < y + h;
		}
	}

	protected AloriaScreen(Component title, @Nullable Screen parent) {
		super(title);
		this.parent = parent;
	}

	// ---------------------------------------------------------------- zones cliquables

	protected void onClick(String id, int x, int y, int w, int h, Runnable action) {
		pending.add(new Hit(id, x, y, w, h, action));
	}

	/** Centre d'une zone cliquable (coordonnées de l'interface), ou null si absente de l'image courante */
	public int @Nullable [] hitCenter(String id) {
		for (Hit hit : hits) {
			if (hit.id().equals(id)) return new int[] {hit.x() + hit.w() / 2, hit.y() + hit.h() / 2};
		}
		return null;
	}

	/** À appeler au début du rendu : les zones de l'image précédente restent valides jusqu'à la fin de celle-ci */
	protected void beginHits() {
		pending.clear();
	}

	protected void endHits() {
		hits.clear();
		hits.addAll(pending);
	}

	@Override
	public final void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		beginHits();
		draw(g, mouseX, mouseY);
		endHits();
		super.extractRenderState(g, mouseX, mouseY, a);
	}

	protected abstract void draw(GuiGraphicsExtractor g, int mouseX, int mouseY);

	/** Clic gauche sur une zone enregistrée ; sinon laisse l'écran gérer */
	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (event.button() == InputConstants.MOUSE_BUTTON_LEFT) {
			for (int i = hits.size() - 1; i >= 0; i--) {
				Hit hit = hits.get(i);
				if (hit.contains(event.x(), event.y())) {
					lastClickX = event.x();
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
		return Component.literal(text).withStyle(ChatFormatting.BOLD);
	}

	/** Bouton plat ; « accent » = turquoise plein */
	protected void button(GuiGraphicsExtractor g, int mouseX, int mouseY, int x, int y, int w, int h, String label, boolean accent, Runnable action) {
		boolean hover = hovered(mouseX, mouseY, x, y, w, h);
		int bg = accent ? (hover ? Theme.LAGOON : Theme.SEA) : (hover ? Theme.CARD_HOVER : Theme.CARD);
		round(g, x, y, w, h, bg);
		if (!accent) roundOutline(g, x, y, w, h, hover ? Theme.BORDER_HOVER : Theme.BORDER);
		g.centeredText(font, label, x + w / 2, y + (h - 8) / 2, accent || hover ? Theme.WHITE : Theme.FOAM);
		onClick("btn:" + label, x, y, w, h, action);
	}

	/** Interrupteur on/off */
	protected void toggle(String id, GuiGraphicsExtractor g, int x, int y, boolean on, Runnable action) {
		round(g, x, y, 24, 12, on ? Theme.SEA : 0xFF27465A);
		int knob = on ? x + 13 : x + 2;
		round(g, knob, y + 2, 9, 8, on ? Theme.WHITE : 0xFF9DB4C0);
		onClick(id, x - 2, y - 2, 28, 16, action);
	}
}
