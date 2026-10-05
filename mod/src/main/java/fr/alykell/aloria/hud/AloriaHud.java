package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.InputConstants;
import fr.alykell.aloria.hud.config.HudConfig;
import fr.alykell.aloria.hud.module.HudModule;
import fr.alykell.aloria.hud.module.Modules;
import fr.alykell.aloria.hud.screen.HudEditorScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
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

	@Override
	public void onInitializeClient() {
		config = HudConfig.load(MODULES);

		HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(MOD_ID, "hud"), HudRenderer::extract);

		// Maj droite ouvre l'éditeur, comme sur Lunar / Feather (modifiable dans les contrôles)
		KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(MOD_ID, "main"));
		KeyMapping openEditor = KeyMappingHelper.registerKeyMapping(
			new KeyMapping("key.aloriahud.editor", InputConstants.KEY_RSHIFT, category)
		);

		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			Stats.tick(mc);
			while (openEditor.consumeClick()) {
				if (mc.gui.screen() == null && mc.player != null) mc.gui.setScreen(new HudEditorScreen(null));
			}
		});

		// Bouton « Aloria HUD » dans le menu Échap
		ScreenEvents.AFTER_INIT.register((mc, screen, width, height) -> {
			if (!(screen instanceof PauseScreen pause) || !pause.showsPauseMenu()) return;
			Screens.getWidgets(screen).add(
				Button.builder(Component.literal("✦ Aloria HUD"), b -> mc.gui.setScreen(new HudEditorScreen(screen)))
					.bounds(width / 2 - 60, height - 32, 120, 20)
					.build()
			);
		});

		LOGGER.info("Aloria HUD prêt ({} modules)", MODULES.size());
	}
}
