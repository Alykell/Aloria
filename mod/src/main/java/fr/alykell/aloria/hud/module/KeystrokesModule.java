package fr.alykell.aloria.hud.module;

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
		return new ModuleSettings(true, 0.01f, 0.55f);
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
		int bg = down ? Theme.withAlpha(s.color, 0xD0) : (s.background ? 0x900A2C3D : 0x00000000);
		g.fill(x, y, x + w, y + h, bg);
		if (!s.background && !down) g.outline(x, y, w, h, Theme.withAlpha(s.color, 0x80));
		int color = down ? Theme.SEA_DEEP : Theme.WHITE;
		int textY = y + (h - 8) / 2;
		g.centeredText(mc.font, label, x + w / 2, textY, color);
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

		int spaceBg = o.keyJump.isDown() ? Theme.withAlpha(s.color, 0xD0) : (s.background ? 0x900A2C3D : 0x00000000);
		g.fill(0, row4, WIDTH, row4 + SPACE_H, spaceBg);
		if (!s.background && !o.keyJump.isDown()) g.outline(0, row4, WIDTH, SPACE_H, Theme.withAlpha(s.color, 0x80));
		int barColor = o.keyJump.isDown() ? Theme.SEA_DEEP : Theme.WHITE;
		g.horizontalLine(WIDTH / 2 - 12, WIDTH / 2 + 12, row4 + SPACE_H / 2, barColor);
	}
}
