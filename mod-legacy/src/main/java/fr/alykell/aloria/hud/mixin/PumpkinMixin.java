package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.gui.hud.InGameHud;
import net.minecraft.client.util.Window;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Écran Visuel : retire le contour de la citrouille portée sur la tête. */
@Mixin(InGameHud.class)
public class PumpkinMixin {
	@Inject(method = "renderPumpkinBlur", at = @At("HEAD"), cancellable = true)
	private void aloriahud$hidePumpkin(Window window, CallbackInfo ci) {
		if (Visual.settings().hidePumpkin) ci.cancel();
	}
}
