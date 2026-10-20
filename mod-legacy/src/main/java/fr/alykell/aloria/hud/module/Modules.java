package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.Stats;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
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
			super("fps");
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
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			return Collections.singletonList(new Line("CPS", Stats.leftCps() + " | " + Stats.rightCps()));
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
			switch (direction) {
				case NORTH: return Tr.tr("coords.north");
				case SOUTH: return Tr.tr("coords.south");
				case EAST: return Tr.tr("coords.east");
				case WEST: return Tr.tr("coords.west");
				default: return direction.getName();
			}
		}

		@Override
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			PlayerEntity p = mc.player;
			boolean showBiome = AloriaHud.config().get(this).showBiome;
			List<Line> lines = new ArrayList<Line>();
			if (p == null || mc.world == null) {
				lines.addAll(Arrays.asList(new Line("X", "128.5"), new Line("Y", "64"), new Line("Z", "-256.5"), new Line(Tr.tr("coords.facing"), Tr.tr("coords.north"))));
				if (showBiome) lines.add(new Line(Tr.tr("coords.biome"), Tr.tr("coords.biomeExample")));
				return lines;
			}
			lines.add(new Line("X", String.format(Locale.ROOT, "%.1f", p.x)));
			lines.add(new Line("Y", String.valueOf((int) Math.floor(p.y))));
			lines.add(new Line("Z", String.format(Locale.ROOT, "%.1f", p.z)));
			lines.add(new Line(Tr.tr("coords.facing"), facing(p.getHorizontalDirection())));
			// En 1.8.9 les biomes n'ont pas de traduction : leur nom anglais (« Plains »)
			if (showBiome) lines.add(new Line(Tr.tr("coords.biome"), mc.world.getBiome(new BlockPos(p)).name));
			return lines;
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
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			return Collections.singletonList(new Line(Tr.tr("module.speed"), Tr.tr("speed.value", String.format(Locale.ROOT, "%.2f", Stats.speed()))));
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
		protected List<Line> lines(MinecraftClient mc, boolean preview) {
			double reach = Stats.reach();
			if (reach < 0 && preview) reach = 3.2;
			return Collections.singletonList(new Line(Tr.tr("module.reach"), reach < 0 ? "—" : Tr.tr("reach.value", String.format(Locale.ROOT, "%.2f", reach))));
		}
	}

	static final class Clock extends TextModule {
		Clock() {
			super("clock");
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
