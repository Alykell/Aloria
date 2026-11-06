package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.GameElements;
import net.minecraft.client.gui.GuiIngame;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Tableau des scores et barre de boss déplacés et agrandis (éléments du jeu). */
@Mixin(GuiIngame.class)
public class GameElementsMixin {
	@Inject(method = "renderScoreboard", at = @At("HEAD"), require = 0)
	private void aloriahud$moveSidebar(CallbackInfo ci) {
		GameElements.begin("scoreboard");
	}

	@Inject(method = "renderScoreboard", at = @At("TAIL"), require = 0)
	private void aloriahud$restoreSidebar(CallbackInfo ci) {
		GameElements.end();
	}

	@Inject(method = "renderBossHealth", at = @At("HEAD"), require = 0)
	private void aloriahud$moveBossBar(CallbackInfo ci) {
		GameElements.begin("bossbar");
	}

	@Inject(method = "renderBossHealth", at = @At("TAIL"), require = 0)
	private void aloriahud$restoreBossBar(CallbackInfo ci) {
		GameElements.end();
	}
}
