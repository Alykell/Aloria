package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Fonts;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/**
 * Élément du jeu lui-même (tableau des scores, chat, barres de boss) : Aloria ne le dessine pas, il le déplace et
 * l'agrandit (mixins, voir GameElements). Activé = position et taille d'Aloria ; désactivé = place habituelle.
 * Dans la disposition et le menu, un exemple tient lieu d'aperçu.
 */
public abstract class GameElementModule extends HudModule {
	/** Point de l'élément qui reste fixe (ex. bord droit au milieu pour le tableau des scores) */
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

	/** En jeu, rien à dessiner : c'est le jeu qui dessine l'élément */
	@Override
	public boolean hasContent(Minecraft mc) {
		return false;
	}

	/** Place habituelle du point d'ancrage, en pixels de l'interface */
	@Override
	public abstract float[] naturalAnchor(int screenW, int screenH);

	protected static void line(GuiGraphicsExtractor g, Minecraft mc, String text, int x, int y, int color) {
		Fonts.draw(g, mc, Fonts.MINECRAFT, text, x, y, color, false);
	}

	protected static int width(Minecraft mc, String text) {
		return Fonts.width(mc, Fonts.MINECRAFT, text);
	}

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
		public int width(Minecraft mc, ModuleSettings s, boolean preview) {
			int w = width(mc, "Aloria");
			for (String[] l : SAMPLE) w = Math.max(w, width(mc, l[0] + ": " + l[1]));
			return w + 4;
		}

		@Override
		public int height(Minecraft mc, ModuleSettings s, boolean preview) {
			return (SAMPLE.length + 1) * 9 + 1;
		}

		@Override
		public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
			int w = width(mc, s, true);
			g.fill(0, 0, w, 10, 0x66000000);
			g.fill(0, 10, w, height(mc, s, true), 0x4C000000);
			line(g, mc, "Aloria", (w - width(mc, "Aloria")) / 2, 1, 0xFFFFFFFF);
			for (int i = 0; i < SAMPLE.length; i++) {
				int y = 10 + i * 9;
				line(g, mc, SAMPLE[i][0], 2, y, 0xFFAAAAAA);
				line(g, mc, SAMPLE[i][1], w - 2 - width(mc, SAMPLE[i][1]), y, 0xFFFF5555);
			}
		}
	}

	/** Chat : en bas à gauche, au-dessus du champ de saisie */
	public static final class Chat extends GameElementModule {
		private static final String[] SAMPLE = {"<Royer> on se rejoint au nether ?", "<Alykell> j'arrive", "<mtx> gg"};

		public Chat() {
			super("chat", "bl");
		}

		@Override
		public float[] naturalAnchor(int screenW, int screenH) {
			return new float[] {0, screenH - 40};
		}

		@Override
		public int width(Minecraft mc, ModuleSettings s, boolean preview) {
			int w = 0;
			for (String l : SAMPLE) w = Math.max(w, width(mc, l));
			return Math.max(w + 8, 160);
		}

		@Override
		public int height(Minecraft mc, ModuleSettings s, boolean preview) {
			return SAMPLE.length * 9;
		}

		@Override
		public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
			int w = width(mc, s, true);
			g.fill(0, 0, w, height(mc, s, true), 0x80000000);
			for (int i = 0; i < SAMPLE.length; i++) line(g, mc, SAMPLE[i], 4, i * 9 + 1, 0xFFFFFFFF);
		}
	}

	/** Barres de boss : en haut, au centre */
	public static final class BossBars extends GameElementModule {
		public BossBars() {
			super("bossbar", "tc");
		}

		@Override
		public float[] naturalAnchor(int screenW, int screenH) {
			return new float[] {screenW / 2f, 0};
		}

		@Override
		public int width(Minecraft mc, ModuleSettings s, boolean preview) {
			return 182;
		}

		@Override
		public int height(Minecraft mc, ModuleSettings s, boolean preview) {
			return 19;
		}

		@Override
		public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
			String name = Tr.tr("game.bossbar.sample");
			line(g, mc, name, (182 - width(mc, name)) / 2, 3, 0xFFFFFFFF);
			g.fill(0, 12, 182, 17, 0xFF4A1050);
			g.fill(0, 12, 120, 17, 0xFFE040E0);
		}
	}
}
