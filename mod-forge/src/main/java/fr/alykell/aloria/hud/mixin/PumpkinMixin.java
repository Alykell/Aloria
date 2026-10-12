package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.gui.GuiIngame;
import net.minecraft.client.gui.ScaledResolution;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Écran Visuel : retire le contour de la citrouille portée sur la tête (GuiIngameForge garde la méthode du jeu). */
@Mixin(GuiIngame.class)
public class PumpkinMixin {
	@Inject(method = "renderPumpkinOverlay", at = @At("HEAD"), cancellable = true)
	private void aloriahud$hidePumpkin(ScaledResolution res, CallbackInfo ci) {
		if (Visual.settings().hidePumpkin) ci.cancel();
	}
}
