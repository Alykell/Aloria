package fr.alykell.aloria.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

/**
 * Police lisse d'Aloria (Nunito, comme le launcher) au lieu de la police pixelisée de Minecraft.
 * Les symboles absents de Nunito (✦, ⚙…) retombent sur la police du jeu (voir font/smooth.json).
 */
public final class Fonts {
	private static final FontDescription SMOOTH = new FontDescription.Resource(Identifier.fromNamespaceAndPath(AloriaHud.MOD_ID, "smooth"));
	private static final FontDescription SMOOTH_BOLD = new FontDescription.Resource(Identifier.fromNamespaceAndPath(AloriaHud.MOD_ID, "smooth_bold"));

	private Fonts() {
	}

	private static boolean smooth() {
		return AloriaHud.config().global().smoothFont;
	}

	public static Component text(String text) {
		MutableComponent c = Component.literal(text);
		return smooth() ? c.withStyle(Style.EMPTY.withFont(SMOOTH)) : c;
	}

	public static Component bold(String text) {
		MutableComponent c = Component.literal(text);
		return smooth() ? c.withStyle(Style.EMPTY.withFont(SMOOTH_BOLD)) : c.withStyle(Style.EMPTY.withBold(true));
	}

	public static int width(Minecraft mc, String text) {
		return mc.font.width(text(text));
	}

	public static void draw(GuiGraphicsExtractor g, Minecraft mc, String text, int x, int y, int color, boolean shadow) {
		g.text(mc.font, text(text), x, y, color, shadow);
	}

	public static void centered(GuiGraphicsExtractor g, Minecraft mc, String text, int x, int y, int color) {
		g.centeredText(mc.font, text(text), x, y, color);
	}
}
