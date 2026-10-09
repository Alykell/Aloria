package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.Stats;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.GameOptions;
import net.minecraft.client.option.KeyBinding;

/** Touches de déplacement, clics (avec CPS) et saut, qui s'allument quand on appuie. */
public final class KeystrokesModule extends HudModule {
	private static final int KEY = 22;
	private static final int GAP = 2;
	private static final int WIDTH = KEY * 3 + GAP * 2;
	private static final int MOUSE_W = (WIDTH - GAP) / 2;
	private static final int SPACE_H = 12;

	public KeystrokesModule() {
		super("keystrokes");
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
	public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		return WIDTH;
	}

	@Override
	public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		return KEY * 3 + SPACE_H + GAP * 3;
	}

	private static void key(G g, ModuleSettings s, int x, int y, int w, int h, String label, boolean down) {
		if (down) Draw.round(g, x, y, w, h, Theme.withAlpha(Draw.textColor(s), 0xC8));
		else Draw.panel(g, x, y, w, h, s);
		int color = down ? Theme.SEA_DEEP : Theme.WHITE;
		g.text(label, x + (w - g.textWidth(label)) / 2, y + (h - 8) / 2, color, !down && s.shadow);
	}

	private static String name(KeyBinding key) {
		String label = GameOptions.getFormattedNameForKeyCode(key.getCode());
		return label.length() > 3 ? label.substring(0, 3) : label;
	}

	@Override
	public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
		GameOptions o = mc.options;
		int row2 = KEY + GAP;
		int row3 = row2 + KEY + GAP;
		int row4 = row3 + KEY + GAP;

		key(g, s, KEY + GAP, 0, KEY, KEY, name(o.forwardKey), o.forwardKey.isPressed());
		key(g, s, 0, row2, KEY, KEY, name(o.leftKey), o.leftKey.isPressed());
		key(g, s, KEY + GAP, row2, KEY, KEY, name(o.backKey), o.backKey.isPressed());
		key(g, s, (KEY + GAP) * 2, row2, KEY, KEY, name(o.rightKey), o.rightKey.isPressed());
		key(g, s, 0, row3, MOUSE_W, KEY, Stats.leftCps() + " CPS", o.attackKey.isPressed());
		key(g, s, WIDTH - MOUSE_W, row3, MOUSE_W, KEY, Stats.rightCps() + " CPS", o.useKey.isPressed());

		boolean jump = o.jumpKey.isPressed();
		if (jump) Draw.round(g, 0, row4, WIDTH, SPACE_H, Theme.withAlpha(Draw.textColor(s), 0xC8));
		else Draw.panel(g, 0, row4, WIDTH, SPACE_H, s);
		g.horizontalLine(WIDTH / 2 - 12, WIDTH / 2 + 12, row4 + SPACE_H / 2, jump ? Theme.SEA_DEEP : Theme.WHITE);
	}
}
