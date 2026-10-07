package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.MinecraftClient;

import java.util.List;

/** Module composé de lignes « Libellé valeur » : libellé dans la couleur du module, valeur en blanc. */
public abstract class TextModule extends HudModule {
	protected static final int PADDING = 4;
	protected static final int LINE_HEIGHT = 10;

	public static final class Line {
		final String label;
		final String value;

		public Line(String label, String value) {
			this.label = label;
			this.value = value;
		}
	}

	protected TextModule(String id, String name) {
		super(id, name);
	}

	protected abstract List<Line> lines(MinecraftClient mc, boolean preview);

	private static String spaced(Line line) {
		return line.label.isEmpty() ? line.value : line.label + " ";
	}

	@Override
	public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		int max = 0;
		for (Line line : lines(mc, preview)) {
			int w = line.label.isEmpty() ? g.textWidth(line.value) : g.textWidth(spaced(line)) + g.textWidth(line.value);
			max = Math.max(max, w);
		}
		return max + PADDING * 2;
	}

	@Override
	public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		return Math.max(1, lines(mc, preview).size()) * LINE_HEIGHT - 1 + PADDING * 2;
	}

	@Override
	public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
		Draw.panel(g, 0, 0, width(mc, g, s, preview), height(mc, g, s, preview), s);
		int y = PADDING;
		for (Line line : lines(mc, preview)) {
			if (line.label.isEmpty()) {
				g.text(line.value, PADDING, y, Draw.textColor(s), s.shadow);
			} else {
				String label = spaced(line);
				g.text(label, PADDING, y, Draw.textColor(s), s.shadow);
				g.text(line.value, PADDING + g.textWidth(label), y, Theme.WHITE, s.shadow);
			}
			y += LINE_HEIGHT;
		}
	}
}
