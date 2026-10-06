package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.Fonts;
import fr.alykell.aloria.hud.Stats;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Touches de déplacement, clics (avec CPS) et saut, qui s'allument quand on appuie. */
public final class KeystrokesModule extends HudModule {
	private static final int KEY = 22;
	private static final int GAP = 2;
	private static final int WIDTH = KEY * 3 + GAP * 2;
	private static final int MOUSE_W = (WIDTH - GAP) / 2;
	private static final int SPACE_H = 12;

	public KeystrokesModule() {
		super("keystrokes", "Touches");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 0f, 1f);
	}

	@Override
	public String category() {
		return "pvp";
	}

	@Override
	public int width(Minecraft mc, ModuleSettings s, boolean preview) {
		return WIDTH;
	}

	@Override
	public int height(Minecraft mc, ModuleSettings s, boolean preview) {
		return KEY * 3 + SPACE_H + GAP * 3;
	}

	private static void key(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, int x, int y, int w, int h, String label, boolean down) {
		if (down) Draw.round(g, x, y, w, h, Theme.withAlpha(Draw.textColor(s), 0xC8));
		else Draw.panel(g, x, y, w, h, s);
		int color = down ? Theme.SEA_DEEP : Theme.WHITE;
		int textY = y + (h - 8) / 2;
		Fonts.centered(g, mc, s.font, label, x + w / 2, textY, color);
	}

	private static String name(KeyMapping key) {
		String label = key.getTranslatedKeyMessage().getString();
		return label.length() > 3 ? label.substring(0, 3) : label;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
		var o = mc.options;
		int row2 = KEY + GAP;
		int row3 = row2 + KEY + GAP;
		int row4 = row3 + KEY + GAP;

		key(g, mc, s, KEY + GAP, 0, KEY, KEY, name(o.keyUp), o.keyUp.isDown());
		key(g, mc, s, 0, row2, KEY, KEY, name(o.keyLeft), o.keyLeft.isDown());
		key(g, mc, s, KEY + GAP, row2, KEY, KEY, name(o.keyDown), o.keyDown.isDown());
		key(g, mc, s, (KEY + GAP) * 2, row2, KEY, KEY, name(o.keyRight), o.keyRight.isDown());
		key(g, mc, s, 0, row3, MOUSE_W, KEY, Stats.leftCps() + " CPS", o.keyAttack.isDown());
		key(g, mc, s, WIDTH - MOUSE_W, row3, MOUSE_W, KEY, Stats.rightCps() + " CPS", o.keyUse.isDown());

		if (o.keyJump.isDown()) Draw.round(g, 0, row4, WIDTH, SPACE_H, Theme.withAlpha(Draw.textColor(s), 0xC8));
		else Draw.panel(g, 0, row4, WIDTH, SPACE_H, s);
		int barColor = o.keyJump.isDown() ? Theme.SEA_DEEP : Theme.WHITE;
		g.horizontalLine(WIDTH / 2 - 12, WIDTH / 2 + 12, row4 + SPACE_H / 2, barColor);
	}
}
