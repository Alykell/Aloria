package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Stats;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.Direction;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Les modules de la 1.8.9 (mêmes identifiants et réglages par défaut que le mod moderne). */
public final class Modules {
	private Modules() {
	}

	public static List<HudModule> all() {
		return Arrays.asList(
			new Fps(),
			new Cps(),
			new Coordinates(),
			new Speed(),
			new Reach(),
			new Clock(),
			new KeystrokesModule(),
			new ArmorModule(),
			new EffectsModule(),
			new LookModule(),
			new ExplosionModule()
		);
	}

	static final class Fps extends TextModule {
		Fps() {
			super("fps", "FPS");
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(true, 1f, 0f);
		}

		@Override
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			return Collections.singletonList(new Line("FPS", String.valueOf(MinecraftClient.getCurrentFps())));
		}
	}

	static final class Cps extends TextModule {
		Cps() {
			super("cps", "CPS");
		}

		@Override
		public String category() {
			return "pvp";
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 1f, 0.085f);
		}

		@Override
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			return Collections.singletonList(new Line("CPS", Stats.leftCps() + " | " + Stats.rightCps()));
		}
	}

	static final class Coordinates extends TextModule {
		Coordinates() {
			super("coords", "Coordonnées");
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 0f, 0f);
		}

		private static String facing(Direction direction) {
			switch (direction) {
				case NORTH: return "Nord (-Z)";
				case SOUTH: return "Sud (+Z)";
				case EAST: return "Est (+X)";
				case WEST: return "Ouest (-X)";
				default: return direction.getName();
			}
		}

		@Override
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			PlayerEntity p = mc.player;
			if (p == null) {
				return Arrays.asList(new Line("X", "128.5"), new Line("Y", "64"), new Line("Z", "-256.5"), new Line("Vers", "Nord (-Z)"));
			}
			return Arrays.asList(
				new Line("X", String.format(Locale.ROOT, "%.1f", p.x)),
				new Line("Y", String.valueOf((int) Math.floor(p.y))),
				new Line("Z", String.format(Locale.ROOT, "%.1f", p.z)),
				new Line("Vers", facing(p.getHorizontalDirection()))
			);
		}
	}

	static final class Speed extends TextModule {
		Speed() {
			super("speed", "Vitesse");
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 0f, 0.16f);
		}

		@Override
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			return Collections.singletonList(new Line("Vitesse", String.format(Locale.ROOT, "%.2f b/s", Stats.speed())));
		}
	}

	/** Distance du dernier coup porté (ex. « 3.20 blocs ») */
	static final class Reach extends TextModule {
		Reach() {
			super("reach", "Reach");
		}

		@Override
		public String category() {
			return "pvp";
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 1f, 0.17f);
		}

		@Override
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			double reach = Stats.reach();
			if (reach < 0 && preview) reach = 3.2;
			return Collections.singletonList(new Line("Reach", reach < 0 ? "—" : String.format(Locale.ROOT, "%.2f blocs", reach)));
		}
	}

	static final class Clock extends TextModule {
		Clock() {
			super("clock", "Horloge");
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 1f, 0.17f);
		}

		@Override
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			return Collections.singletonList(new Line("", new SimpleDateFormat("HH:mm").format(new Date())));
		}
	}
}
