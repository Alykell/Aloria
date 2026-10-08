package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.InputConstants;
import fr.alykell.aloria.hud.config.HudConfig;
import fr.alykell.aloria.hud.module.HudModule;
import fr.alykell.aloria.hud.module.Modules;
import fr.alykell.aloria.hud.screen.HudMenuScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
//#if MC >= 12106
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
//#else
//$$ import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
//#endif
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.minecraft.world.InteractionResult;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class AloriaHud implements ClientModInitializer {
	public static final String MOD_ID = "aloriahud";
	public static final Logger LOGGER = LoggerFactory.getLogger("Aloria HUD");

	private static final List<HudModule> MODULES = Modules.all();
	private static HudConfig config;

	public static List<HudModule> modules() {
		return MODULES;
	}

	public static HudConfig config() {
		return config;
	}

	/** Le module Effets remplace les icônes d'effets de Minecraft (en haut à droite) quand il est activé */
	public static boolean effectsModuleEnabled() {
		return MODULES.stream().filter(m -> m.id().equals("effects")).findFirst().map(m -> config.get(m).enabled).orElse(false);
	}

	@Override
	public void onInitializeClient() {
		config = HudConfig.load(MODULES);

		//#if MC >= 12106
		HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(MOD_ID, "hud"), HudRenderer::extract);
		// Le module Effets remplace les icônes d'effets de Minecraft (en haut à droite) quand il est activé
		HudElementRegistry.replaceElement(VanillaHudElements.MOB_EFFECTS, vanilla -> (g, delta) -> {
			if (!effectsModuleEnabled()) vanilla.extractRenderState(g, delta);
		});
		//#elseif MC >= 12100
		//$$ // Avant 1.21.6 : ancien événement de Fabric ; les icônes d'effets du jeu sont cachées par GuiEffectsMixin
		//$$ HudRenderCallback.EVENT.register(HudRenderer::extract);
		//#else
		//$$ HudRenderCallback.EVENT.register(HudRenderer::render);
		//#endif

		// Maj droite ouvre l'éditeur, comme sur Lunar / Feather (modifiable dans les contrôles)
		//#if MC >= 12109
		KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(MOD_ID, "main"));
		//#else
		//$$ String category = "key.category.aloriahud.main";
		//#endif
		KeyMapping openEditor = KeyMappingHelper.registerKeyMapping(
			new KeyMapping("key.aloriahud.editor", InputConstants.KEY_RSHIFT, category)
		);

		if (SelfTest.enabled()) SelfTest.init();

		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			Stats.tick(mc);
			if (SelfTest.enabled()) SelfTest.tick(mc);
			while (openEditor.consumeClick()) {
				if (mc.gui.screen() == null && mc.player != null) mc.gui.setScreen(new HudMenuScreen(null));
			}
		});

		// Coup porté (côté client) : mesure du Reach
		AttackEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
			// Aussi appelé côté serveur intégré en solo : on ne garde que le joueur du client
			if (player == net.minecraft.client.Minecraft.getInstance().player) Stats.onAttack(player, entity);
			return InteractionResult.PASS;
		});

		// Bouton « Aloria HUD » dans le menu Échap
		ScreenEvents.AFTER_INIT.register((mc, screen, width, height) -> {
			//#if MC >= 12002
			if (!(screen instanceof PauseScreen pause) || !pause.showsPauseMenu()) return;
			//#else
			//$$ // Menu Échap sans boutons (F3 + Échap) : rien à ajouter
			//$$ if (!(screen instanceof PauseScreen) || Screens.getWidgets(screen).isEmpty()) return;
			//#endif
			// Sous le dernier bouton du menu, à la même largeur
			int bottom = Screens.getWidgets(screen).stream().mapToInt(w -> w.getY() + w.getHeight()).max().orElse(height / 2);
			Screens.getWidgets(screen).add(
				Button.builder(Component.literal("✦ Aloria HUD"), b -> mc.gui.setScreen(new HudMenuScreen(screen)))
					.bounds(width / 2 - 102, Math.min(bottom + 8, height - 24), 204, 20)
					.build()
			);
		});

		LOGGER.info("Aloria HUD prêt ({} modules, réglages : {})", MODULES.size(), HudConfig.file());
	}
}
