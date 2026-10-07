package fr.alykell.aloria.hud;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.resources.Identifier;
//#if MC >= 12106
import net.minecraft.client.renderer.RenderPipelines;
//#elseif MC >= 12102
//$$ import net.minecraft.client.renderer.RenderType;
//$$ import net.minecraft.util.ARGB;
//#else
//$$ import com.mojang.blaze3d.systems.RenderSystem;
//#endif

/**
 * Dessin 2D qui diffère selon la version : avant 1.21.6 l'interface utilise une matrice 3D (pushPose, translate x y z),
 * et les icônes se dessinent sans « pipeline ». Le reste du code passe par ici.
 */
public final class Gfx {
	private Gfx() {
	}

	public static void push(GuiGraphicsExtractor g) {
		//#if MC >= 12106
		g.pose().pushMatrix();
		//#else
		//$$ g.pose().pushPose();
		//#endif
	}

	public static void pop(GuiGraphicsExtractor g) {
		//#if MC >= 12106
		g.pose().popMatrix();
		//#else
		//$$ g.pose().popPose();
		//#endif
	}

	public static void translate(GuiGraphicsExtractor g, float x, float y) {
		//#if MC >= 12106
		g.pose().translate(x, y);
		//#else
		//$$ g.pose().translate(x, y, 0);
		//#endif
	}

	public static void scale(GuiGraphicsExtractor g, float scale) {
		//#if MC >= 12106
		g.pose().scale(scale, scale);
		//#else
		//$$ g.pose().scale(scale, scale, 1);
		//#endif
	}

	//#if MC < 12106
	//$$ /** Avant 1.21.6 : sprite d'un autre atlas (ex. icônes d'effets) */
	//$$ public static void atlasSprite(GuiGraphicsExtractor g, net.minecraft.client.renderer.texture.TextureAtlasSprite sprite, int x, int y, int w, int h) {
	//#if MC >= 12102
	//$$ 	g.blitSprite(RenderType::guiTextured, sprite, x, y, w, h);
	//#else
	//$$ 	g.blit(x, y, 0, w, h, sprite);
	//#endif
	//$$ }
	//$$
	//#endif
	/** Icône de l'atlas de l'interface (sprite), avec une opacité de 0 à 1 */
	public static void sprite(GuiGraphicsExtractor g, Identifier sprite, int x, int y, int w, int h, float alpha) {
		//#if MC >= 12106
		g.blitSprite(RenderPipelines.GUI_TEXTURED, sprite, x, y, w, h, alpha);
		//#elseif MC >= 12102
		//$$ g.blitSprite(RenderType::guiTextured, sprite, x, y, w, h, ARGB.white(alpha));
		//#else
		//$$ RenderSystem.setShaderColor(1, 1, 1, alpha);
		//$$ g.blitSprite(sprite, x, y, w, h);
		//$$ RenderSystem.setShaderColor(1, 1, 1, 1);
		//#endif
	}
}
