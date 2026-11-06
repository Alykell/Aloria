package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.MinecraftClient;

/**
 * Élément du jeu lui-même (tableau des scores, chat, barres de boss), comme dans mod/ : Aloria ne le dessine pas, il le
 * déplace et l'agrandit (mixins, voir GameElements). Dans la disposition et le menu, un exemple tient lieu d'aperçu.
 */
public abstract class GameElementModule extends HudModule {
	private final String anchor;

	protected GameElementModule(String id, String anchor) {
		super(id);
		this.anchor = anchor;
	}

	@Override
	public String category() {
		return "game";
	}

	@Override
	public String fixedAnchor() {
		return anchor;
	}

	@Override
	public boolean styled() {
		return false;
	}

	@Override
	public String hint() {
		return Tr.tr("game.element.hint");
	}

	@Override
	public ModuleSettings defaults() {
		// x < 0 : à sa place habituelle, calculée selon la taille de l'écran (HudRenderer.bounds)
		ModuleSettings s = new ModuleSettings(false, -1f, -1f);
		s.anchor = anchor;
		s.anchored = true;
		return s;
	}

	@Override
	public boolean hasContent(MinecraftClient mc) {
		return false;
	}

	@Override
	public abstract float[] naturalAnchor(int screenW, int screenH);

	/** Tableau des scores : collé au bord droit, au milieu de l'écran */
	public static final class Scoreboard extends GameElementModule {
		private static final String[][] SAMPLE = {{"Alykell", "12"}, {"Royer", "9"}, {"mtx", "4"}};

		public Scoreboard() {
			super("scoreboard", "mr");
		}

		@Override
		public float[] naturalAnchor(int screenW, int screenH) {
			return new float[] {screenW - 1, screenH / 2f};
		}

		@Override
		public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
			int w = g.textWidth("Aloria");
			for (String[] l : SAMPLE) w = Math.max(w, g.textWidth(l[0] + ": " + l[1]));
			return w + 4;
		}

		@Override
		public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
			return (SAMPLE.length + 1) * 9 + 1;
		}

		@Override
		public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
			int w = width(mc, g, s, true);
			g.fill(0, 0, w, 10, 0x66000000);
			g.fill(0, 10, w, height(mc, g, s, true), 0x4C000000);
			g.text("Aloria", (w - g.textWidth("Aloria")) / 2, 1, 0xFFFFFFFF, false);
			for (int i = 0; i < SAMPLE.length; i++) {
				int y = 10 + i * 9;
				g.text(SAMPLE[i][0], 2, y, 0xFFAAAAAA, false);
				g.text(SAMPLE[i][1], w - 2 - g.textWidth(SAMPLE[i][1]), y, 0xFFFF5555, false);
			}
		}
	}

	/** Chat : en bas à gauche, au-dessus du champ de saisie (en 1.8.9, le jeu le dessine vers le haut depuis là) */
	public static final class Chat extends GameElementModule {
		private static final String[] SAMPLE = {"<Royer> on se rejoint au nether ?", "<Alykell> j'arrive", "<mtx> gg"};

		public Chat() {
			super("chat", "bl");
		}

		@Override
		public float[] naturalAnchor(int screenW, int screenH) {
			return new float[] {0, screenH - 48};
		}

		@Override
		public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
			int w = 0;
			for (String l : SAMPLE) w = Math.max(w, g.textWidth(l));
			return Math.max(w + 8, 160);
		}

		@Override
		public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
			return SAMPLE.length * 9;
		}

		@Override
		public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
			int w = width(mc, g, s, true);
			g.fill(0, 0, w, height(mc, g, s, true), 0x80000000);
			for (int i = 0; i < SAMPLE.length; i++) g.text(SAMPLE[i], 4, i * 9 + 1, 0xFFFFFFFF, false);
		}
	}

	/** Barre de boss : en haut, au centre */
	public static final class BossBars extends GameElementModule {
		public BossBars() {
			super("bossbar", "tc");
		}

		@Override
		public float[] naturalAnchor(int screenW, int screenH) {
			return new float[] {screenW / 2f, 0};
		}

		@Override
		public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
			return 182;
		}

		@Override
		public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
			return 19;
		}

		@Override
		public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
			String name = Tr.tr("game.bossbar.sample");
			g.text(name, (182 - g.textWidth(name)) / 2, 2, 0xFFFFFFFF, false);
			g.fill(0, 12, 182, 17, 0xFF4A1050);
			g.fill(0, 12, 120, 17, 0xFFE040E0);
		}
	}
}
