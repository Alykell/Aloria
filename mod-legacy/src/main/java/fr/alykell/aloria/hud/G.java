package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.GlStateManager;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawableHelper;
import net.minecraft.client.render.DiffuseLighting;
import net.minecraft.client.util.Window;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Identifier;
import org.lwjgl.opengl.GL11;

/**
 * Dessin 2D en 1.8.9, avec les mêmes noms que l'API moderne (fill, text, item…) pour garder le code des modules
 * et des menus proche de celui du mod principal. Les polices TTF n'existent pas en 1.8.9 : police du jeu.
 */
public final class G {
	private final MinecraftClient mc = MinecraftClient.getInstance();
	private final int width;
	private final int height;

	public G() {
		Window window = new Window(mc);
		this.width = window.getWidth();
		this.height = window.getHeight();
	}

	public int guiWidth() {
		return width;
	}

	public int guiHeight() {
		return height;
	}

	public void fill(int x1, int y1, int x2, int y2, int color) {
		DrawableHelper.fill(x1, y1, x2, y2, color);
	}

	public void horizontalLine(int x1, int x2, int y, int color) {
		if (x2 < x1) {
			int t = x1;
			x1 = x2;
			x2 = t;
		}
		fill(x1, y, x2 + 1, y + 1, color);
	}

	public void verticalLine(int x, int y1, int y2, int color) {
		if (y2 < y1) {
			int t = y1;
			y1 = y2;
			y2 = t;
		}
		fill(x, y1, x + 1, y2 + 1, color);
	}

	/** Dégradé vertical (couleur du haut → couleur du bas) */
	public void fillGradient(int x1, int y1, int x2, int y2, int top, int bottom) {
		for (int y = y1; y < y2; y++) {
			float t = (y2 - y1) <= 1 ? 0 : (y - y1) / (float) (y2 - y1 - 1);
			fill(x1, y, x2, y + 1, lerpColor(top, bottom, t));
		}
	}

	private static int lerpColor(int a, int b, float t) {
		int r = 0;
		for (int shift = 0; shift <= 24; shift += 8) {
			int ca = (a >>> shift) & 0xFF;
			int cb = (b >>> shift) & 0xFF;
			r |= Math.round(ca + (cb - ca) * t) << shift;
		}
		return r;
	}

	public int textWidth(String text) {
		return mc.textRenderer.getStringWidth(text);
	}

	public void text(String text, int x, int y, int color, boolean shadow) {
		// En 1.8.9, une couleur sans alpha s'afficherait opaque : on force l'alpha si absent
		mc.textRenderer.draw(text, (float) x, (float) y, (color & 0xFF000000) == 0 ? color | 0xFF000000 : color, shadow);
		GlStateManager.color(1, 1, 1, 1);
	}

	public void centeredText(String text, int x, int y, int color) {
		text(text, x - textWidth(text) / 2, y, color, true);
	}

	/** Objet d'inventaire 16 × 16 */
	public void item(ItemStack stack, int x, int y) {
		if (stack == null) return;
		GlStateManager.enableRescaleNormal();
		// Éclairage des objets d'interface (comme la barre du jeu) ; enableNormally est celui du monde et assombrit les blocs
		DiffuseLighting.enable();
		mc.getItemRenderer().renderInGuiWithOverrides(stack, x, y);
		DiffuseLighting.disable();
		GlStateManager.disableRescaleNormal();
		GlStateManager.enableBlend();
		GlStateManager.disableLighting();
		GlStateManager.color(1, 1, 1, 1);
	}

	/** Morceau de texture 256 × 256 (ex. icônes d'effets de l'inventaire) */
	public void texture(Identifier texture, int x, int y, int u, int v, int w, int h, float alpha) {
		mc.getTextureManager().bindTexture(texture);
		GlStateManager.enableBlend();
		GlStateManager.color(1, 1, 1, alpha);
		DrawableHelper.drawTexture(x, y, u, v, w, h, 256, 256);
		GlStateManager.color(1, 1, 1, 1);
	}

	// ---------------------------------------------------------------- transformations

	public void push() {
		GlStateManager.pushMatrix();
	}

	public void pop() {
		GlStateManager.popMatrix();
	}

	public void translate(float x, float y) {
		GlStateManager.translate(x, y, 0);
	}

	public void scale(float scale) {
		GlStateManager.scale(scale, scale, 1);
	}

	// ---------------------------------------------------------------- découpe (contenu qui défile)

	public void enableScissor(int x1, int y1, int x2, int y2) {
		int factor = new Window(mc).getScaleFactor();
		GL11.glEnable(GL11.GL_SCISSOR_TEST);
		GL11.glScissor(x1 * factor, mc.height - y2 * factor, Math.max(0, x2 - x1) * factor, Math.max(0, y2 - y1) * factor);
	}

	public void disableScissor() {
		GL11.glDisable(GL11.GL_SCISSOR_TEST);
	}
}
