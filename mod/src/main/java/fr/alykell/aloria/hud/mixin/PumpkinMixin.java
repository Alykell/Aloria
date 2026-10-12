package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Retire le contour de la citrouille portée sur la tête (option de l'écran Visuel). */
//#if MC >= 260000
@Mixin(Hud.class)
//#else
//$$ @Mixin(Gui.class)
//#endif
public class PumpkinMixin {
	//#if MC >= 260000
	@Inject(method = "extractTextureOverlay", at = @At("HEAD"), cancellable = true)
	//#else
	//$$ @Inject(method = "renderTextureOverlay", at = @At("HEAD"), cancellable = true)
	//#endif
	private void aloriahud$hidePumpkin(GuiGraphicsExtractor graphics, Identifier texture, float alpha, CallbackInfo ci) {
		if (Visual.hidesOverlay(texture)) ci.cancel();
	}
}
