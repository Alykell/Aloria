package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.InputConstants;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.platform.Window;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import fr.alykell.aloria.hud.screen.AloriaScreen;
import fr.alykell.aloria.hud.screen.HudLayoutScreen;
import fr.alykell.aloria.hud.screen.HudMenuScreen;
import net.minecraft.client.Minecraft;
import net.minecraft.client.KeyboardHandler;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.input.MouseButtonInfo;
import net.fabricmc.fabric.api.client.screen.v1.Screens;

import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.function.BooleanSupplier;

/**
 * Auto-test de l'interface, activé uniquement avec -Daloriahud.selftest=<dossier>.
 * Passe par le vrai gestionnaire de souris du jeu (mouvements et clics simulés),
 * vérifie chaque étape, prend des captures puis ferme le jeu.
 */
public final class SelfTest {
	private record Step(String name, int delay, BooleanSupplier action) {
	}

	private static final ArrayDeque<Step> STEPS = new ArrayDeque<>();
	private static Path output;
	private static int wait;
	private static int inWorldTicks;
	private static int failures;
	private static int retries;
	private static String lastMissing = "";
	/** Nombre de ticks d'attente maximum pour qu'une zone apparaisse (2 s) */
	private static final int MAX_RETRIES = 40;

	private SelfTest() {
	}

	public static boolean enabled() {
		return System.getProperty("aloriahud.selftest") != null;
	}

	private static void log(String message) {
		AloriaHud.LOGGER.info("[selftest] {}", message);
	}

	private static ModuleSettings settings(String id) {
		for (HudModule m : AloriaHud.modules()) if (m.id().equals(id)) return AloriaHud.config().get(m);
		throw new IllegalArgumentException(id);
	}

	// ---------------------------------------------------------------- souris simulée

	private static void moveTo(Minecraft mc, double guiX, double guiY) {
		// Coordonnées « écran » de la fenêtre (mise à l'échelle Windows comprise), comme une vraie souris
		Window w = mc.getWindow();
		double sx = guiX * w.getScreenWidth() / w.getGuiScaledWidth();
		double sy = guiY * w.getScreenHeight() / w.getGuiScaledHeight();
		// Signature différente selon la version (26.2 : 3 paramètres, 26.3 : 5) : appel par réflexion
		Method move = mouseMethod("onMove");
		if (move.getParameterCount() == 3) call(move, mc, w.handle(), sx, sy);
		else call(move, mc, w.handle(), sx, sy, 0.0, 0.0);
	}

	private static void button(Minecraft mc, boolean press) {
		// Privée en 26.2 : appel par réflexion
		call(mouseMethod("onButton"), mc, mc.getWindow().handle(), new MouseButtonInfo(InputConstants.MOUSE_BUTTON_LEFT, 0), press ? 1 : 0);
	}

	private static Method mouseMethod(String name) {
		for (Method m : MouseHandler.class.getDeclaredMethods()) {
			if (m.getName().equals(name) && m.getParameterTypes().length > 0 && m.getParameterTypes()[0] == long.class) {
				m.setAccessible(true);
				return m;
			}
		}
		throw new IllegalStateException("MouseHandler." + name + " introuvable");
	}

	private static void call(Method method, Minecraft mc, Object... args) {
		try {
			method.invoke(mc.mouseHandler, args);
		} catch (ReflectiveOperationException e) {
			throw new RuntimeException(e);
		}
	}

	private static boolean clickAt(Minecraft mc, double x, double y) {
		moveTo(mc, x, y);
		Window w = mc.getWindow();
		var before = mc.gui.screen();
		log(String.format("clic visé (%.1f, %.1f) → souris du jeu (%.1f, %.1f), écran %s",
			x, y, mc.mouseHandler.getScaledXPos(w), mc.mouseHandler.getScaledYPos(w), before == null ? "aucun" : before.getClass().getSimpleName()));
		button(mc, true);
		button(mc, false);
		var after = mc.gui.screen();
		if (after != before) log("→ l'écran devient " + (after == null ? "aucun" : after.getClass().getSimpleName()));
		return true;
	}

	/**
	 * Clique au centre d'une zone de l'écran Aloria ouvert.
	 * Renvoie faux tant que la zone n'est pas encore dessinée : l'étape sera réessayée.
	 */
	private static boolean click(Minecraft mc, String id) {
		lastMissing = id;
		if (!(mc.gui.screen() instanceof AloriaScreen screen)) return false;
		int[] c = screen.hitCenter(id);
		if (c == null) return false;
		return clickAt(mc, c[0], c[1]);
	}

	/** Tape du texte comme au clavier (signature différente selon la version : appel par réflexion) */
	private static void type(Minecraft mc, String text) {
		for (Method m : KeyboardHandler.class.getDeclaredMethods()) {
			if (!m.getName().equals("charTyped") || m.getParameterTypes().length == 0 || m.getParameterTypes()[0] != long.class) continue;
			m.setAccessible(true);
			for (int cp : text.codePoints().toArray()) {
				try {
					Class<?> second = m.getParameterTypes()[1];
					if (m.getParameterCount() == 2 && second != int.class) {
						m.invoke(mc.keyboardHandler, mc.getWindow().handle(), second.getConstructor(int.class).newInstance(cp));
					} else if (m.getParameterCount() == 3) {
						m.invoke(mc.keyboardHandler, mc.getWindow().handle(), cp, 0);
					} else {
						m.invoke(mc.keyboardHandler, mc.getWindow().handle(), cp);
					}
				} catch (ReflectiveOperationException e) {
					throw new RuntimeException(e);
				}
			}
			return;
		}
		throw new IllegalStateException("KeyboardHandler.charTyped introuvable");
	}

	private static boolean check(String what, boolean ok) {
		log((ok ? "OK : " : "ÉCHEC : ") + what);
		if (!ok) failures++;
		return true;
	}

	private static boolean screenshot(Minecraft mc, String name) {
		Screenshot.takeScreenshot(mc.gameRenderer.mainRenderTarget(), (NativeImage image) -> {
			try (image) {
				image.writeToFile(output.resolve(name + ".png"));
				log("capture " + name);
			} catch (Exception e) {
				AloriaHud.LOGGER.error("capture impossible", e);
			}
		});
		return true;
	}

	// ---------------------------------------------------------------- scénario

	public static void init() {
		output = Path.of(System.getProperty("aloriahud.selftest"));
		try {
			Files.createDirectories(output);
		} catch (Exception e) {
			throw new RuntimeException(e);
		}

		Minecraft mc = Minecraft.getInstance();
		if (menuOnly()) {
			addMenuSteps(mc);
			return;
		}
		add("premier lancement : seul FPS actif", 0, () -> {
			mc.gui.setScreen(null);
			boolean onlyFps = AloriaHud.modules().stream().allMatch(m -> AloriaHud.config().get(m).enabled == m.id().equals("fps"));
			return check("seul le module FPS est actif par défaut", onlyFps);
		});
		add("capture du HUD", 20, () -> screenshot(mc, "01-hud-defaut"));
		add("ouvrir le menu Échap", 5, () -> {
			mc.gui.setScreen(new PauseScreen(true));
			return true;
		});
		add("bouton Aloria HUD dans le menu Échap", 10, () -> {
			AbstractWidget hudButton = Screens.getWidgets(mc.gui.screen()).stream()
				.filter(w -> w.getMessage().getString().contains("Aloria HUD")).findFirst().orElse(null);
			check("le bouton « Aloria HUD » est présent", hudButton != null);
			screenshot(mc, "02-menu-echap");
			if (hudButton == null) return true;
			return clickAt(mc, hudButton.getX() + hudButton.getWidth() / 2.0, hudButton.getY() + hudButton.getHeight() / 2.0);
		});
		add("menu des modules ouvert", 10, () -> {
			check("le clic ouvre le menu des modules", mc.gui.screen() instanceof HudMenuScreen);
			return screenshot(mc, "03-menu-modules");
		});
		add("activer CPS depuis sa carte", 5, () -> click(mc, "toggle:cps"));
		add("CPS activé", 3, () -> check("le bouton Activé de la carte CPS fonctionne", settings("cps").enabled));
		add("onglet PvP", 2, () -> click(mc, "tab:pvp"));
		add("capture onglet PvP", 5, () -> screenshot(mc, "04-onglet-pvp"));
		add("onglet Tous", 2, () -> click(mc, "tab:all"));
		add("ouvrir les réglages de FPS", 3, () -> click(mc, "gear:fps"));
		add("ouvrir le sélecteur (texte)", 3, () -> click(mc, "pick:text"));
		add("capture du sélecteur", 5, () -> screenshot(mc, "05a-selecteur-couleur"));
		add("couleur sable", 2, () -> click(mc, "preset:2"));
		add("couleur appliquée", 2, () -> check("le sélecteur change la couleur du texte", settings("fps").color == Theme.PALETTE[2]));
		add("teinte à la barre", 2, () -> click(mc, "picker:hue"));
		add("teinte appliquée", 2, () -> check("la barre de teinte change la couleur", settings("fps").color != Theme.PALETTE[2]));
		add("valider la couleur", 2, () -> click(mc, "btn:OK"));
		add("ouvrir le sélecteur (fond)", 3, () -> click(mc, "pick:bg"));
		add("fond vert", 2, () -> click(mc, "preset:4"));
		add("fond appliqué (couleur)", 2, () -> check("le sélecteur change la couleur du fond", settings("fps").bgColor == (Theme.PALETTE[4] & 0xFFFFFF)));
		add("taper un code couleur", 2, () -> {
			if (!(mc.gui.screen() instanceof HudMenuScreen menu) || menu.hexBoxForTest() == null) return check("champ du code couleur présent", false);
			menu.hexBoxForTest().setValue("");
			type(mc, "ff6b00");
			return true;
		});
		add("code appliqué", 2, () -> check("le code tapé change la couleur (" + Integer.toHexString(settings("fps").bgColor) + ")", settings("fps").bgColor == 0xFF6B00));
		add("capture du sélecteur (code)", 3, () -> screenshot(mc, "05e-code-couleur"));
		add("clic hors du sélecteur", 2, () -> clickAt(mc, 2, 2));
		add("rouvrir le sélecteur (texte)", 3, () -> click(mc, "pick:text"));
		add("couleur récente", 3, () -> click(mc, "recent:0"));
		add("récente appliquée", 2, () -> check("la couleur récente s'applique (" + Integer.toHexString(settings("fps").color) + ")", (settings("fps").color & 0xFFFFFF) == 0xFF6B00));
		add("fermer (récentes)", 2, () -> click(mc, "btn:OK"));
		add("sélecteur fermé", 2, () -> click(mc, "font:next"));
		add("police suivante", 2, () -> check("le sélecteur de police change la police (" + settings("fps").font + ")", settings("fps").font.equals("inter")));
		add("défiler les réglages", 2, () -> {
			if (mc.gui.screen() instanceof HudMenuScreen menu) menu.mouseScrolled(0, 0, 0, -10);
			return true;
		});
		add("bordure plus épaisse", 2, () -> click(mc, "border:+"));
		add("bordure appliquée", 2, () -> check("le bouton + épaissit la bordure", settings("fps").borderWidth == 2));
		add("appliquer à tous", 2, () -> click(mc, "apply-all"));
		add("style appliqué à tous", 2, () -> check("« Appliquer à tous » copie fond et bordure sur tous les modules",
			AloriaHud.modules().stream().allMatch(m -> AloriaHud.config().get(m).borderWidth == 2 && AloriaHud.config().get(m).bgColor == 0xFF6B00)));
		add("cacher avec le chat", 2, () -> click(mc, "hideInChat"));
		add("option chat appliquée", 2, () -> check("l'interrupteur « Cacher quand le chat est ouvert » fonctionne", settings("fps").hideInChat));
		add("style indépendant", 2, () -> click(mc, "ownStyle"));
		add("option style appliquée", 2, () -> check("l'interrupteur « Ignorer tous les modules » fonctionne", settings("fps").ownStyle));
		add("capture bordure", 3, () -> screenshot(mc, "05d-bordure"));
		add("remonter les réglages", 2, () -> {
			if (mc.gui.screen() instanceof HudMenuScreen menu) menu.mouseScrolled(0, 0, 0, 10);
			return true;
		});
		add("fond désactivé", 2, () -> click(mc, "background"));
		add("fond appliqué", 2, () -> check("l'interrupteur Fond fonctionne", !settings("fps").background));
		add("capture des réglages", 3, () -> screenshot(mc, "05b-reglages"));
		add("fond réactivé", 2, () -> click(mc, "background"));
		add("taille au curseur", 2, () -> {
			if (!(mc.gui.screen() instanceof AloriaScreen screen) || screen.hitCenter("slider") == null) {
				lastMissing = "slider";
				return false;
			}
			int[] c = screen.hitCenter("slider");
			return clickAt(mc, c[0] + 30, c[1]);
		});
		add("taille appliquée", 3, () -> {
			check("le curseur change la taille", settings("fps").scale > 1.0f);
			return screenshot(mc, "05-reglages-fps");
		});
		add("opacité au curseur", 2, () -> {
			if (!(mc.gui.screen() instanceof AloriaScreen screen) || screen.hitCenter("opacity") == null) {
				lastMissing = "opacity";
				return false;
			}
			int[] c = screen.hitCenter("opacity");
			return clickAt(mc, c[0], c[1]);
		});
		add("opacité appliquée", 2, () -> check("le curseur d'opacité fonctionne (" + settings("fps").opacity + "%)", Math.abs(settings("fps").opacity - 50) <= 5));
		add("retour à la grille", 2, () -> click(mc, "btn:← Retour"));
		add("onglet Général", 2, () -> click(mc, "tab:general"));
		add("police des menus", 3, () -> click(mc, "menufont:next"));
		add("capture onglet Général", 5, () -> {
			check("la police des menus change (" + AloriaHud.config().global().menuFont + ")", AloriaHud.config().global().menuFont.equals("inter"));
			return screenshot(mc, "05c-general");
		});
		add("couleur commune", 2, () -> click(mc, "sameTextColor"));
		add("couleur commune activée", 2, () -> check("l'interrupteur « Même couleur de texte » fonctionne", AloriaHud.config().global().sameTextColor));
		add("police à tous", 2, () -> {
			// FPS a un style indépendant : sa police ne doit pas changer
			settings("fps").font = "poppins";
			return click(mc, "btn:Appliquer cette police à tous les modules");
		});
		add("police à tous appliquée", 2, () -> check("« Appliquer la police à tous » ignore les modules au style indépendant",
			settings("cps").font.equals("inter") && settings("fps").font.equals("poppins")));
		add("police des menus (retour)", 2, () -> click(mc, "menufont:prev"));
		add("onglet Tous (fin)", 2, () -> click(mc, "tab:all"));
		add("ouvrir la disposition", 3, () -> click(mc, "btn:✥ Disposition"));
		add("écran de disposition", 5, () -> {
			check("le bouton Disposition ouvre l'éditeur", mc.gui.screen() instanceof HudLayoutScreen);
			return screenshot(mc, "06-disposition");
		});
		add("glisser FPS", 2, () -> {
			HudModule fps = AloriaHud.modules().getFirst();
			var b = HudRenderer.bounds(mc, fps, settings("fps"), mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight(), true);
			moveTo(mc, b.x() + 3, b.y() + 3);
			button(mc, true);
			return true;
		});
		add("glisser FPS (déplacement)", 2, () -> {
			moveTo(mc, 120, 90);
			// Minecraft ignore les mouvements quand sa fenêtre n'a pas le focus : on livre le glisser directement
			if (mc.gui.screen() instanceof HudLayoutScreen layout) {
				layout.mouseDragged(new MouseButtonEvent(120, 90, new MouseButtonInfo(InputConstants.MOUSE_BUTTON_LEFT, 0)), 0, 0);
			}
			return true;
		});
		add("glisser FPS (relâcher)", 2, () -> {
			button(mc, false);
			return true;
		});
		add("FPS déplacé", 2, () -> {
			ModuleSettings s = settings("fps");
			check("le glisser-déposer déplace le module (x=" + s.x + ", y=" + s.y + ")", s.x < 0.5f && s.y > 0.05f);
			return screenshot(mc, "07-apres-glisser");
		});
		add("terminer la disposition", 2, () -> click(mc, "btn:Terminé"));
		add("retour au menu", 3, () -> check("Terminé ramène au menu des modules", mc.gui.screen() instanceof HudMenuScreen));
		add("fermer", 2, () -> click(mc, "btn:✕"));
		add("HUD final", 10, () -> {
			check("✕ ferme le menu", !(mc.gui.screen() instanceof AloriaScreen));
			mc.gui.setScreen(null);
			return true;
		});
		add("capture finale", 15, () -> screenshot(mc, "08-hud-final"));
		add("HUD complet (style)", 2, () -> {
			for (HudModule m : AloriaHud.modules()) {
				AloriaHud.config().reset(m);
				AloriaHud.config().get(m).enabled = !m.id().equals("speed") && !m.id().equals("clock");
			}
			// Monde de test uniquement : un peu d'armure et des effets pour voir les vrais modules
			var server = mc.getSingleplayerServer();
			if (server != null && mc.player != null) {
				var uuid = mc.player.getUUID();
				server.execute(() -> {
					var player = server.getPlayerList().getPlayer(uuid);
					if (player == null) return;
					player.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.IRON_HELMET));
					player.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.DIAMOND_CHESTPLATE));
					player.addEffect(new MobEffectInstance(MobEffects.STRENGTH, 20 * 90, 1));
					player.addEffect(new MobEffectInstance(MobEffects.SPEED, 20 * 45));
					player.addEffect(new MobEffectInstance(MobEffects.FIRE_RESISTANCE, 20 * 300));
				});
			}
			return true;
		});
		add("capture HUD complet", 15, () -> screenshot(mc, "09-hud-complet"));
		add("TNT, creeper et bloc visé", 2, () -> {
			// Couleur commune rose, sauf FPS (style indépendant) qui garde la sienne
			AloriaHud.config().global().sameTextColor = true;
			AloriaHud.config().global().textColor = 0xFFFF9EC7;
			settings("fps").ownStyle = true;
			settings("fps").color = 0xFFFFD166;
			settings("fps").hideInChat = true;
			mc.player.setXRot(35f);
			var server = mc.getSingleplayerServer();
			if (server == null) return check("monde solo disponible", false);
			// Restes d'un test interrompu (TNT enregistrée avec le monde) : ils exploseraient sur le joueur
			removeExplosives(mc, true);
			var uuid = mc.player.getUUID();
			server.execute(() -> {
				var player = server.getPlayerList().getPlayer(uuid);
				if (player == null) return;
				var level = player.level();
				var look = net.minecraft.world.phys.Vec3.directionFromRotation(0, player.getYRot());
				var tntPos = player.position().add(look.scale(6));
				var tnt = new net.minecraft.world.entity.item.PrimedTnt(level, tntPos.x, tntPos.y + 1, tntPos.z, null);
				tnt.setFuse(400);
				tnt.setNoGravity(true);
				level.addFreshEntity(tnt);
				var creeper = net.minecraft.world.entity.EntityTypes.CREEPER.create(level, net.minecraft.world.entity.EntitySpawnReason.COMMAND);
				if (creeper != null) {
					var side = look.yRot((float) Math.toRadians(30)).scale(7);
					creeper.setPos(player.position().add(side).add(0, 1, 0));
					creeper.setNoAi(true);
					creeper.setSwellDir(1);
					level.addFreshEntity(creeper);
				}
			});
			return true;
		});
		add("chronos visibles", 12, () -> {
			int fuses = 0;
			for (var e : mc.level.entitiesForRendering()) {
				if (e instanceof net.minecraft.world.entity.item.PrimedTnt t && t.getFuse() > 0) fuses++;
				if (e instanceof net.minecraft.world.entity.monster.Creeper c && c.getSwellDir() > 0) fuses++;
			}
			check("TNT et creeper amorcés côté client (" + fuses + ")", fuses == 2);
			HudModule look = AloriaHud.modules().stream().filter(m -> m.id().equals("look")).findFirst().orElseThrow();
			check("le module Bloc visé a quelque chose à montrer", look.hasContent(mc));
			return screenshot(mc, "10-explosions-bloc-vise");
		});
		add("désamorcer le creeper", 1, () -> removeExplosives(mc, false));
		add("ouvrir le chat", 2, () -> {
			mc.gui.setScreen(new net.minecraft.client.gui.screens.ChatScreen("", false));
			return true;
		});
		add("capture chat ouvert", 10, () -> screenshot(mc, "11-chat-ouvert"));
		add("retirer la TNT", 20, () -> removeExplosives(mc, true));
		add("fin", 5, () -> {
			log(failures == 0 ? "TERMINÉ : tout est OK" : "TERMINÉ : " + failures + " échec(s)");
			mc.stop();
			return true;
		});
	}

	/** Retire du monde de test les creepers et, si demandé, la TNT amorcée, pour ne rien laisser exploser */
	private static boolean removeExplosives(Minecraft mc, boolean tnt) {
		var server = mc.getSingleplayerServer();
		if (server == null) return true;
		server.execute(() -> server.getAllLevels().forEach(level -> {
			level.getEntities(net.minecraft.world.entity.EntityTypes.CREEPER, c -> true).forEach(net.minecraft.world.entity.Entity::discard);
			if (tnt) level.getEntities(net.minecraft.world.entity.EntityTypes.TNT, t -> true).forEach(net.minecraft.world.entity.Entity::discard);
		}));
		return true;
	}

	private static void add(String name, int delay, BooleanSupplier action) {
		STEPS.add(new Step(name, delay, action));
	}

	/** Mode « menu seul » : teste le menu depuis l'écran titre, sans partie (ex. autre version du jeu) */
	private static boolean menuOnly() {
		return System.getProperty("aloriahud.selftest.menu") != null;
	}

	private static void addMenuSteps(Minecraft mc) {
		add("menu depuis l'écran titre", 0, () -> {
			mc.gui.setScreen(new HudMenuScreen(mc.gui.screen()));
			return true;
		});
		add("capture du menu", 10, () -> {
			check("le menu des modules s'ouvre", mc.gui.screen() instanceof HudMenuScreen);
			return screenshot(mc, "m1-menu");
		});
		add("onglet PvP", 2, () -> click(mc, "tab:pvp"));
		add("activer Effets", 2, () -> click(mc, "toggle:effects"));
		add("Effets activé", 2, () -> check("le bouton Activé de la carte Effets fonctionne", settings("effects").enabled));
		add("réglages d'Armure", 2, () -> click(mc, "gear:armor"));
		add("capture réglages", 5, () -> screenshot(mc, "m2-reglages"));
		add("sélecteur de couleur", 2, () -> click(mc, "pick:text"));
		add("couleur jaune", 3, () -> click(mc, "preset:3"));
		add("couleur appliquée", 2, () -> check("le sélecteur change la couleur", settings("armor").color == Theme.PALETTE[3]));
		add("capture sélecteur", 3, () -> screenshot(mc, "m3-selecteur"));
		add("valider", 2, () -> click(mc, "btn:OK"));
		add("fermer", 2, () -> click(mc, "btn:✕"));
		add("fin", 10, () -> {
			check("✕ ferme le menu", !(mc.gui.screen() instanceof AloriaScreen));
			log(failures == 0 ? "TERMINÉ : tout est OK" : "TERMINÉ : " + failures + " échec(s)");
			mc.stop();
			return true;
		});
	}

	public static void tick(Minecraft mc) {
		if (STEPS.isEmpty()) return;
		if (!menuOnly() && (mc.player == null || mc.level == null)) return;
		// Écran de chargement (ressources) : les clics y sont ignorés
		if (mc.gui.overlay() != null) return;
		mc.options.pauseOnLostFocus = false;
		// Laisse le monde se charger (et ferme l'écran d'intro de la démo)
		if (inWorldTicks++ < 100) {
			// Joueur mort lors d'un test précédent : on le fait réapparaître
			if (inWorldTicks == 40 && mc.player != null && mc.player.isDeadOrDying()) mc.player.respawn();
			if (inWorldTicks == 60 && mc.gui.screen() != null) mc.gui.setScreen(null);
			return;
		}
		if (wait > 0) {
			wait--;
			return;
		}
		Step step = STEPS.poll();
		if (retries == 0) log("étape : " + step.name());
		try {
			if (!step.action().getAsBoolean()) {
				// Zone pas encore dessinée (jeu lent) : on réessaie au tick suivant
				if (++retries < MAX_RETRIES) {
					STEPS.addFirst(step);
					return;
				}
				log("ÉCHEC : zone introuvable " + lastMissing);
				failures++;
			}
			retries = 0;
		} catch (Exception e) {
			retries = 0;
			failures++;
			AloriaHud.LOGGER.error("[selftest] ÉCHEC (exception) à l'étape " + step.name(), e);
		}
		if (!STEPS.isEmpty()) wait = STEPS.peek().delay();
	}
}
