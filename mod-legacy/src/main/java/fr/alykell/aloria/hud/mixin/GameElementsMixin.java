package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.GameElements;
import net.minecraft.client.gui.hud.InGameHud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Tableau des scores et barre de boss déplacés et agrandis (éléments du jeu). */
@Mixin(InGameHud.class)
public class GameElementsMixin {
	@Inject(method = "renderScoreboardObjective", at = @At("HEAD"))
	private void aloriahud$moveSidebar(CallbackInfo ci) {
		GameElements.begin("scoreboard");
	}

	@Inject(method = "renderScoreboardObjective", at = @At("TAIL"))
	private void aloriahud$restoreSidebar(CallbackInfo ci) {
		GameElements.end();
	}

	@Inject(method = "renderBossBar", at = @At("HEAD"))
	private void aloriahud$moveBossBar(CallbackInfo ci) {
		GameElements.begin("bossbar");
	}

	@Inject(method = "renderBossBar", at = @At("TAIL"))
	private void aloriahud$restoreBossBar(CallbackInfo ci) {
		GameElements.end();
	}
}
