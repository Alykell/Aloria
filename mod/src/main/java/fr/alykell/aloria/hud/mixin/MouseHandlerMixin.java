package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Stats;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
//#if MC >= 12109
import net.minecraft.client.input.MouseButtonInfo;
//#endif
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Compte les clics en jeu pour le CPS (pas dans les menus). */
@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
	//#if MC >= 12109
	@Inject(method = "onButton", at = @At("HEAD"))
	private void aloriahud$countClick(long handle, MouseButtonInfo info, int action, CallbackInfo ci) {
		if (action == 1 && Minecraft.getInstance().gui.screen() == null) {
			Stats.onClick(info.button());
		}
	}
	//#else
	//$$ @Inject(method = "onPress", at = @At("HEAD"))
	//$$ private void aloriahud$countClick(long handle, int button, int action, int mods, CallbackInfo ci) {
	//$$ 	if (action == 1 && Minecraft.getInstance().gui.screen() == null) {
	//$$ 		Stats.onClick(button);
	//$$ 	}
	//$$ }
	//#endif
}
