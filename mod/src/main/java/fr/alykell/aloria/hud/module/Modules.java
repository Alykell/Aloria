package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Stats;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.Direction;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** Les modules texte simples. */
public final class Modules {
	private Modules() {
	}

	public static List<HudModule> all() {
		return List.of(
			new Fps(),
			new Cps(),
			new Coordinates(),
			new Speed(),
			new Clock(),
			new KeystrokesModule(),
			new ArmorModule(),
			new EffectsModule()
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
		protected List<Line> lines(Minecraft mc, boolean preview) {
			return List.of(new Line("FPS", String.valueOf(mc.getFps())));
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
			return new ModuleSettings(false, 1f, 0.06f);
		}

		@Override
		protected List<Line> lines(Minecraft mc, boolean preview) {
			return List.of(new Line("CPS", Stats.leftCps() + " | " + Stats.rightCps()));
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
			return switch (direction) {
				case NORTH -> "Nord (-Z)";
				case SOUTH -> "Sud (+Z)";
				case EAST -> "Est (+X)";
				case WEST -> "Ouest (-X)";
				default -> direction.getName();
			};
		}

		@Override
		protected List<Line> lines(Minecraft mc, boolean preview) {
			LocalPlayer p = mc.player;
			if (p == null) {
				return List.of(new Line("X", "128.5"), new Line("Y", "64"), new Line("Z", "-256.5"), new Line("Vers", "Nord (-Z)"));
			}
			return List.of(
				new Line("X", String.format(Locale.ROOT, "%.1f", p.getX())),
				new Line("Y", String.valueOf(p.blockPosition().getY())),
				new Line("Z", String.format(Locale.ROOT, "%.1f", p.getZ())),
				new Line("Vers", facing(p.getDirection()))
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
		protected List<Line> lines(Minecraft mc, boolean preview) {
			return List.of(new Line("Vitesse", String.format(Locale.ROOT, "%.2f b/s", Stats.speed())));
		}
	}

	static final class Clock extends TextModule {
		private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("HH:mm");

		Clock() {
			super("clock", "Horloge");
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 1f, 0.11f);
		}

		@Override
		protected List<Line> lines(Minecraft mc, boolean preview) {
			return List.of(new Line("", LocalTime.now().format(FORMAT)));
		}
	}
}
