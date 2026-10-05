package fr.alykell.aloria.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

import java.util.List;

/**
 * Polices proposées par Aloria (fichiers TTF dans assets/aloriahud/font, licence OFL).
 * Les symboles absents d'une police (✦, ⚙…) retombent sur la police du jeu.
 */
public final class Fonts {
	public record Choice(String id, String label) {
	}

	public static final String MINECRAFT = "minecraft";
	public static final List<Choice> CHOICES = List.of(
		new Choice(MINECRAFT, "Minecraft"),
		new Choice("nunito", "Nunito"),
		new Choice("inter", "Inter"),
		new Choice("poppins", "Poppins"),
		new Choice("montserrat", "Montserrat")
	);

	private Fonts() {
	}

	private static String valid(String font) {
		for (Choice c : CHOICES) if (c.id().equals(font)) return font;
		return "nunito";
	}

	public static String label(String font) {
		String id = valid(font);
		return CHOICES.stream().filter(c -> c.id().equals(id)).findFirst().orElseThrow().label();
	}

	/** Police suivante (dir = 1) ou précédente (dir = -1) dans la liste */
	public static String cycle(String font, int dir) {
		int i = 0;
		while (i < CHOICES.size() && !CHOICES.get(i).id().equals(valid(font))) i++;
		return CHOICES.get(Math.floorMod(i + dir, CHOICES.size())).id();
	}

	private static Style style(String font, boolean bold) {
		String id = valid(font);
		if (id.equals(MINECRAFT)) return Style.EMPTY.withBold(bold);
		return Style.EMPTY.withFont(new FontDescription.Resource(Identifier.fromNamespaceAndPath(AloriaHud.MOD_ID, bold ? id + "_bold" : id)));
	}

	public static Component text(String font, String text) {
		MutableComponent c = Component.literal(text);
		return c.withStyle(style(font, false));
	}

	public static Component bold(String font, String text) {
		return Component.literal(text).withStyle(style(font, true));
	}

	public static int width(Minecraft mc, String font, String text) {
		return mc.font.width(text(font, text));
	}

	public static void draw(GuiGraphicsExtractor g, Minecraft mc, String font, String text, int x, int y, int color, boolean shadow) {
		g.text(mc.font, text(font, text), x, y, color, shadow);
	}

	public static void centered(GuiGraphicsExtractor g, Minecraft mc, String font, String text, int x, int y, int color) {
		g.centeredText(mc.font, text(font, text), x, y, color);
	}

	/** Police des menus Aloria */
	public static String menu() {
		return AloriaHud.config().global().menuFont;
	}
}
