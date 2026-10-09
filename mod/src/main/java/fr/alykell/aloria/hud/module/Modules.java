package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Stats;
import fr.alykell.aloria.hud.Tr;
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
			super("fps");
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
			super("cps");
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
		protected List<Line> lines(Minecraft mc, boolean preview) {
			return List.of(new Line("CPS", Stats.leftCps() + " | " + Stats.rightCps()));
		}
	}

	static final class Coordinates extends TextModule {
		Coordinates() {
			super("coords");
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 0f, 0f);
		}

		private static String facing(Direction direction) {
			return switch (direction) {
				case NORTH -> Tr.tr("coords.north");
				case SOUTH -> Tr.tr("coords.south");
				case EAST -> Tr.tr("coords.east");
				case WEST -> Tr.tr("coords.west");
				default -> direction.getName();
			};
		}

		@Override
		protected List<Line> lines(Minecraft mc, boolean preview) {
			LocalPlayer p = mc.player;
			if (p == null) {
				return List.of(new Line("X", "128.5"), new Line("Y", "64"), new Line("Z", "-256.5"), new Line(Tr.tr("coords.facing"), Tr.tr("coords.north")));
			}
			return List.of(
				new Line("X", String.format(Locale.ROOT, "%.1f", p.getX())),
				new Line("Y", String.valueOf(p.blockPosition().getY())),
				new Line("Z", String.format(Locale.ROOT, "%.1f", p.getZ())),
				new Line(Tr.tr("coords.facing"), facing(p.getDirection()))
			);
		}
	}

	static final class Speed extends TextModule {
		Speed() {
			super("speed");
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 0f, 0.16f);
		}

		@Override
		protected List<Line> lines(Minecraft mc, boolean preview) {
			return List.of(new Line(Tr.tr("module.speed"), Tr.tr("speed.value", String.format(Locale.ROOT, "%.2f", Stats.speed()))));
		}
	}

	/** Distance du dernier coup porté (ex. « 3.20 blocs ») */
	static final class Reach extends TextModule {
		Reach() {
			super("reach");
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
		protected List<Line> lines(Minecraft mc, boolean preview) {
			double reach = Stats.reach();
			if (reach < 0 && preview) reach = 3.2;
			return List.of(new Line(Tr.tr("module.reach"), reach < 0 ? "—" : Tr.tr("reach.value", String.format(Locale.ROOT, "%.2f", reach))));
		}
	}

	static final class Clock extends TextModule {
		private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("HH:mm");

		Clock() {
			super("clock");
		}

		@Override
		public ModuleSettings defaults() {
			return new ModuleSettings(false, 1f, 0.17f);
		}

		@Override
		protected List<Line> lines(Minecraft mc, boolean preview) {
			return List.of(new Line("", LocalTime.now().format(FORMAT)));
		}
	}
}
