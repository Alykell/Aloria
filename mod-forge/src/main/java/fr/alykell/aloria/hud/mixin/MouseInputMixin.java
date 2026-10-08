package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.LegacyOptions;
import fr.alykell.aloria.hud.RawInput;
import net.minecraft.util.MouseHelper;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Entrée brute : remplace le déplacement lu sur le curseur de Windows par celui de la souris (voir RawInput). */
@Mixin(MouseHelper.class)
public class MouseInputMixin {
	@Shadow
	public int deltaX;
	@Shadow
	public int deltaY;

	@Inject(method = "mouseXYChange", at = @At("TAIL"))
	private void aloriahud$rawInput(CallbackInfo ci) {
		if (!LegacyOptions.rawMouseInput || !RawInput.available()) return;
		int[] delta = RawInput.take();
		deltaX = delta[0];
		deltaY = delta[1];
	}
}
