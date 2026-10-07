package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.LegacyOptions;
import fr.alykell.aloria.hud.RawInput;
import net.minecraft.client.MouseInput;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Entrée brute : remplace le déplacement lu sur le curseur de Windows par celui de la souris (voir RawInput). */
@Mixin(MouseInput.class)
public class MouseInputMixin {
	@Shadow
	public int x;
	@Shadow
	public int y;

	@Inject(method = "updateMouse", at = @At("TAIL"))
	private void aloriahud$rawInput(CallbackInfo ci) {
		if (!LegacyOptions.rawMouseInput || !RawInput.available()) return;
		int[] delta = RawInput.take();
		x = delta[0];
		y = delta[1];
	}
}
