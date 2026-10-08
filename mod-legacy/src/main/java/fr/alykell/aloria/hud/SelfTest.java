package fr.alykell.aloria.hud;

import fr.alykell.aloria.hud.config.HudConfig;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.ExplosionModule;
import fr.alykell.aloria.hud.module.HudModule;
import fr.alykell.aloria.hud.module.LookModule;
import net.minecraft.block.Blocks;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import fr.alykell.aloria.hud.screen.AloriaScreen;
import fr.alykell.aloria.hud.screen.HudLayoutScreen;
import fr.alykell.aloria.hud.screen.HudMenuScreen;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.util.ScreenshotUtils;
import net.minecraft.entity.Entity;
import net.minecraft.entity.TntEntity;
import net.minecraft.entity.effect.StatusEffect;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.mob.CreeperEntity;
import net.minecraft.entity.mob.ZombieEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.world.DemoServerWorld;

import java.io.File;
import java.nio.file.Files;
import java.util.ArrayDeque;

/**
 * Auto-test du HUD en 1.8.9, activé uniquement avec -Daloriahud.selftest=<dossier> : lance la démo, vérifie
 * les modules, le menu, le sélecteur de couleur, la disposition et le chrono, prend des captures puis ferme le jeu.
 */
public final class SelfTest {
	private interface Action {
		boolean run();
	}

	private static final class Step {
		final String name;
		final int delay;
		final Action action;

		Step(String name, int delay, Action action) {
			this.name = name;
			this.delay = delay;
			this.action = action;
		}
	}

	private static final ArrayDeque<Step> STEPS = new ArrayDeque<>();
	private static File output;
	private static int wait;
	private static int inWorldTicks;
	private static int failures;
	private static int retries;
	private static boolean demoStarted;

	private SelfTest() {
	}

	public static boolean enabled() {
		return System.getProperty("aloriahud.selftest") != null;
	}

	private static void log(String message) {
		AloriaHud.LOGGER.info("[selftest] " + message);
	}

	private static boolean check(String what, boolean ok) {
		log((ok ? "OK : " : "ÉCHEC : ") + what);
		if (!ok) failures++;
		return true;
	}

	private static ModuleSettings settings(String id) {
		for (HudModule m : AloriaHud.modules()) if (m.id().equals(id)) return AloriaHud.config().get(m);
		throw new IllegalArgumentException(id);
	}

	private static boolean screenshot(MinecraftClient mc, String name) {
		// Capture dans le dossier du test (ScreenshotUtils écrit dans <dossier>/screenshots/<nom>)
		ScreenshotUtils.saveScreenshot(output, name + ".png", mc.width, mc.height, mc.getFramebuffer());
		log("capture " + name);
		return true;
	}

	private static boolean click(MinecraftClient mc, String id) {
		return mc.currentScreen instanceof AloriaScreen && ((AloriaScreen) mc.currentScreen).clickForTest(id);
	}

	/** Exécute sur le serveur intégré, dans son propre fil */
	private static void server(MinecraftClient mc, final ServerAction action) {
		final MinecraftServer server = mc.getServer();
		if (server == null) return;
		server.submit(() -> {
			ServerWorld world = server.getWorld(0);
			if (world != null && !world.playerEntities.isEmpty()) action.run(world, world.playerEntities.get(0));
		});
	}

	private interface ServerAction {
		void run(ServerWorld world, PlayerEntity player);
	}

	private static void add(String name, int delay, Action action) {
		STEPS.add(new Step(name, delay, action));
	}

	public static void init() {
		output = new File(System.getProperty("aloriahud.selftest"));
		output.mkdirs();
		final MinecraftClient mc = MinecraftClient.getInstance();

		add("premier lancement : seul FPS actif", 0, () -> {
			mc.setScreen(null);
			boolean onlyFps = true;
			for (HudModule m : AloriaHud.modules()) onlyFps &= AloriaHud.config().get(m).enabled == m.id().equals("fps");
			return check("seul le module FPS est actif par défaut", onlyFps);
		});
		add("HUD complet", 2, () -> {
			for (HudModule m : AloriaHud.modules()) settings(m.id()).enabled = !m.id().equals("speed") && !m.id().equals("clock");
			server(mc, (world, player) -> {
				player.inventory.armor[3] = new ItemStack(Items.IRON_HELMET);
				player.inventory.armor[2] = new ItemStack(Items.DIAMOND_CHESTPLATE);
				player.inventory.main[player.inventory.selectedSlot] = new ItemStack(Items.DIAMOND_SWORD);
				player.addStatusEffect(new StatusEffectInstance(StatusEffect.STRENGTH.id, 20 * 90, 1));
				player.addStatusEffect(new StatusEffectInstance(StatusEffect.SPEED.id, 20 * 45));
				player.addStatusEffect(new StatusEffectInstance(StatusEffect.FIRE_RESISTANCE.id, 20 * 300));
			});
			return true;
		});
		add("capture HUD complet", 20, () -> screenshot(mc, "01-hud-complet"));
		add("ouvrir le menu", 2, () -> {
			mc.setScreen(new HudMenuScreen(null));
			return true;
		});
		add("capture du menu", 5, () -> {
			check("le menu des modules s'ouvre", mc.currentScreen instanceof HudMenuScreen);
			return screenshot(mc, "02-menu");
		});
		add("désactiver CPS depuis sa carte", 2, () -> click(mc, "toggle:cps"));
		add("CPS désactivé", 2, () -> check("le bouton de la carte CPS fonctionne", !settings("cps").enabled));
		add("onglet PvP", 2, () -> click(mc, "tab:pvp"));
		add("capture onglet PvP", 3, () -> screenshot(mc, "03-onglet-pvp"));
		add("onglet Tous", 2, () -> click(mc, "tab:all"));
		add("réglages de FPS", 2, () -> click(mc, "gear:fps"));
		add("sélecteur de couleur", 2, () -> click(mc, "pick:text"));
		add("couleur sable", 2, () -> click(mc, "preset:2"));
		add("couleur appliquée", 2, () -> check("le sélecteur change la couleur du texte", settings("fps").color == Theme.PALETTE[2]));
		add("capture du sélecteur", 3, () -> screenshot(mc, "04-selecteur"));
		add("valider", 2, () -> click(mc, "btn:OK"));
		add("capture des réglages", 3, () -> screenshot(mc, "05-reglages"));
		add("retour", 2, () -> click(mc, "btn:← Retour"));
		add("disposition", 2, () -> click(mc, "btn:✥ Disposition"));
		add("glisser FPS", 3, () -> {
			if (!(mc.currentScreen instanceof HudLayoutScreen)) return check("le bouton Disposition ouvre l'éditeur", false);
			HudLayoutScreen layout = (HudLayoutScreen) mc.currentScreen;
			G g = new G();
			HudModule fps = AloriaHud.modules().get(0);
			HudRenderer.Bounds b = HudRenderer.bounds(mc, g, fps, settings("fps"), g.guiWidth(), g.guiHeight(), true);
			layout.clickForTestAt(b.x + 3, b.y + 3);
			layout.dragTo(120, 90);
			return true;
		});
		add("FPS déplacé", 2, () -> {
			ModuleSettings s = settings("fps");
			check("le glisser-déposer déplace le module (x=" + s.x + ", y=" + s.y + ")", s.x < 0.5f && s.y > 0.05f);
			return screenshot(mc, "06-disposition");
		});
		add("fermer", 2, () -> {
			mc.setScreen(null);
			AloriaHud.config().save();
			return check("les réglages sont enregistrés dans le fichier commun", Files.exists(HudConfig.file()));
		});
		add("TNT et creeper", 2, () -> {
			mc.player.pitch = 35f;
			server(mc, (world, player) -> {
				double yaw = Math.toRadians(player.yaw);
				double dx = -Math.sin(yaw);
				double dz = Math.cos(yaw);
				TntEntity tnt = new TntEntity(world, player.x + dx * 6, player.y + 1, player.z + dz * 6, null);
				// En 1.8.9, le client ne connaît pas la mèche réelle (il suppose 80 ticks) : on garde la valeur du jeu
				tnt.fuseTimer = 80;
				world.spawnEntity(tnt);
				CreeperEntity creeper = new CreeperEntity(world);
				creeper.updatePositionAndAngles(player.x + dx * 6 + dz * 3, player.y, player.z + dz * 6 - dx * 3, 0, 0);
				// Allumé au briquet : son IA ne le fait pas dégonfler faute de cible
				creeper.ignite();
				world.spawnEntity(creeper);
			});
			return true;
		});
		add("chronos visibles", 6, () -> {
			int fuses = 0;
			for (Entity e : mc.world.loadedEntities) if (ExplosionModule.secondsLeft(e, 0) >= 0) fuses++;
			// Les entités arrivent du serveur intégré à des ticks différents : on attend qu'elles soient toutes là
			if (fuses < 2 && retries < 20) return false;
			check("TNT et creeper amorcés côté client (" + fuses + ")", fuses >= 2);
			return screenshot(mc, "07-explosions");
		});
		add("retirer TNT et creeper", 1, () -> {
			server(mc, (world, player) -> {
				for (Entity e : world.loadedEntities) if (e instanceof TntEntity || e instanceof CreeperEntity) e.remove();
			});
			mc.player.pitch = 80f;
			return true;
		});
		add("effet de niveau > 128", 1, () -> {
			// Comme les serveurs PvP (saut bloqué…) : le niveau 251 arrive en -5 côté client (octet signé)
			server(mc, (world, player) -> player.addStatusEffect(new StatusEffectInstance(StatusEffect.JUMP_BOOST.id, 20 * 5, 250)));
			return true;
		});
		add("module Effets avec ce niveau", 10, () -> {
			boolean received = false;
			for (StatusEffectInstance e : mc.player.getStatusEffectInstances()) if (e.getAmplifier() < 0) received = true;
			if (!received && retries < 20) return false;
			HudModule effects = null;
			for (HudModule m : AloriaHud.modules()) if (m.id().equals("effects")) effects = m;
			boolean ok;
			try {
				effects.width(mc, new G(), settings("effects"), false);
				ok = true;
			} catch (RuntimeException e) {
				AloriaHud.LOGGER.error("[selftest] module Effets", e);
				ok = false;
			}
			check("le module Effets accepte un niveau reçu négatif (reçu : " + received + ")", received && ok);
			return true;
		});
		add("cible du Reach", 2, () -> {
			// Zombie immobile à 3 blocs devant le joueur (centre), au même niveau
			server(mc, (world, player) -> {
				double yaw = Math.toRadians(player.yaw);
				ZombieEntity zombie = new ZombieEntity(world);
				zombie.updatePositionAndAngles(player.x - Math.sin(yaw) * 3, player.y, player.z + Math.cos(yaw) * 3, 0, 0);
				zombie.setAiDisabled(true);
				world.spawnEntity(zombie);
			});
			return true;
		});
		add("coup et Reach", 6, () -> {
			ZombieEntity target = null;
			for (Entity e : mc.world.loadedEntities) if (e instanceof ZombieEntity) target = (ZombieEntity) e;
			if (target == null) return retries >= 20 && check("le zombie du Reach est arrivé", false);
			mc.interactionManager.attackEntity(mc.player, target);
			double reach = Stats.reach();
			// Boîte du zombie : 0,6 de large, donc son bord est à environ 2,7 blocs des yeux
			check(String.format(java.util.Locale.ROOT, "le Reach mesure le coup (%.2f blocs)", reach), reach > 2.5 && reach < 2.95);
			server(mc, (world, player) -> {
				for (Entity e : world.loadedEntities) if (e instanceof ZombieEntity) e.remove();
			});
			return true;
		});
		add("argile orange visée", 3, () -> {
			if (mc.result == null || mc.result.type != BlockHitResult.Type.BLOCK) return retries >= 20;
			final BlockPos pos = mc.result.getBlockPos();
			// Variante 1 = orange : le module doit l'afficher sous ce nom, avec la bonne couleur
			server(mc, (world, player) -> world.setBlockState(pos, Blocks.STAINED_TERRACOTTA.stateFromData(1)));
			return true;
		});
		add("bloc visé", 6, () -> {
			HudModule look = null;
			for (HudModule m : AloriaHud.modules()) if (m.id().equals("look")) look = m;
			check("le module Bloc visé a quelque chose à montrer", look != null && look.hasContent(mc));
			String name = LookModule.targetName(mc);
			check("le Bloc visé montre la variante (" + name + ")", name != null && !name.equals(Blocks.STAINED_TERRACOTTA.getTranslatedName()));
			return screenshot(mc, "08-bloc-vise");
		});
		add("réglages du jeu (1.8.9)", 2, () -> {
			// Écrits dans options.txt par le launcher depuis le jeu de réglages commun
			log("FOV dynamique " + LegacyOptions.fovEffectScale + ", course en bascule " + LegacyOptions.toggleSprint
				+ ", accroupi en bascule " + LegacyOptions.toggleCrouch + ", entrée brute " + LegacyOptions.rawMouseInput);
			return check("l'entrée brute trouve la souris", RawInput.available());
		});
		add("FOV dynamique", 2, () -> {
			float saved = LegacyOptions.fovEffectScale;
			mc.player.setSprinting(true);
			LegacyOptions.fovEffectScale = 1f;
			float normal = mc.player.getSpeed();
			LegacyOptions.fovEffectScale = 0f;
			float off = mc.player.getSpeed();
			LegacyOptions.fovEffectScale = saved;
			mc.player.setSprinting(false);
			return check("le FOV dynamique se désactive (course : " + normal + " → " + off + ")", normal > 1f && off == 1f);
		});
		add("course en bascule", 2, () -> {
			LegacyOptions.toggleSprint = true;
			net.minecraft.client.option.KeyBinding.onKeyPressed(mc.options.sprintKey.getCode());
			return true;
		});
		add("course activée", 2, () -> {
			check("un appui active la course en bascule", mc.options.sprintKey.isPressed());
			net.minecraft.client.option.KeyBinding.onKeyPressed(mc.options.sprintKey.getCode());
			return true;
		});
		add("course désactivée", 2, () -> {
			check("un second appui la désactive", !mc.options.sprintKey.isPressed());
			LegacyOptions.toggleSprint = false;
			mc.setScreen(new HudMenuScreen(null));
			return true;
		});
		add("onglet Général", 3, () -> click(mc, "tab:general"));
		add("capture onglet Général", 3, () -> {
			screenshot(mc, "09-general");
			mc.setScreen(null);
			return true;
		});
		add("fin", 5, () -> {
			log(failures == 0 ? "TERMINÉ : tout est OK" : "TERMINÉ : " + failures + " échec(s)");
			mc.scheduleStop();
			return true;
		});
	}

	public static void tick(MinecraftClient mc) {
		if (STEPS.isEmpty()) return;
		if (mc.world == null || mc.player == null) {
			// Pas de monde de test : la démo officielle crée le sien
			if (!demoStarted && mc.currentScreen instanceof TitleScreen) {
				demoStarted = true;
				log("écran titre : lancement de la démo");
				mc.startIntegratedServer("Demo_World", "Demo_World", DemoServerWorld.INFO);
			}
			return;
		}
		if (inWorldTicks++ < 100) {
			if (inWorldTicks == 60 && mc.currentScreen != null) mc.setScreen(null);
			return;
		}
		if (wait > 0) {
			wait--;
			return;
		}
		Step step = STEPS.poll();
		if (retries == 0) log("étape : " + step.name);
		try {
			if (!step.action.run()) {
				if (++retries < 40) {
					STEPS.addFirst(step);
					return;
				}
				log("ÉCHEC : étape impossible " + step.name);
				failures++;
			}
			retries = 0;
		} catch (Exception e) {
			retries = 0;
			failures++;
			AloriaHud.LOGGER.error("[selftest] ÉCHEC (exception) à l'étape " + step.name, e);
		}
		if (!STEPS.isEmpty()) wait = STEPS.peek().delay;
	}
}
