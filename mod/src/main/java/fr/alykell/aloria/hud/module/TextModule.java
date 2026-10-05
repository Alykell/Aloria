package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.util.List;

/** Module composé de lignes « Libellé valeur » : libellé dans la couleur du module, valeur en blanc. */
public abstract class TextModule extends HudModule {
	protected static final int PADDING = 4;
	protected static final int LINE_HEIGHT = 10;

	public record Line(String label, String value) {
	}

	protected TextModule(String id, String name) {
		super(id, name);
	}

	protected abstract List<Line> lines(Minecraft mc, boolean preview);

	private static String spaced(Line line) {
		return line.label().isEmpty() ? line.value() : line.label() + " ";
	}

	@Override
	public int width(Minecraft mc, ModuleSettings s, boolean preview) {
		int max = 0;
		for (Line line : lines(mc, preview)) {
			int w = line.label().isEmpty()
				? mc.font.width(line.value())
				: mc.font.width(spaced(line)) + mc.font.width(line.value());
			max = Math.max(max, w);
		}
		return max + PADDING * 2;
	}

	@Override
	public int height(Minecraft mc, ModuleSettings s, boolean preview) {
		return Math.max(1, lines(mc, preview).size()) * LINE_HEIGHT - 1 + PADDING * 2;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
		if (s.background) {
			g.fill(0, 0, width(mc, s, preview), height(mc, s, preview), Theme.HUD_BG);
		}
		int y = PADDING;
		for (Line line : lines(mc, preview)) {
			if (line.label().isEmpty()) {
				g.text(mc.font, line.value(), PADDING, y, s.color, s.shadow);
			} else {
				String label = spaced(line);
				g.text(mc.font, label, PADDING, y, s.color, s.shadow);
				g.text(mc.font, line.value(), PADDING + mc.font.width(label), y, Theme.WHITE, s.shadow);
			}
			y += LINE_HEIGHT;
		}
	}
}
