package fr.alykell.aloria.hud.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import fr.alykell.aloria.hud.GameElements;
import net.minecraft.client.gui.components.ChatComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#if MC < 12109
//$$ import net.minecraft.client.gui.GuiGraphics;
//$$ import org.spongepowered.asm.mixin.injection.ModifyVariable;
//#endif

/**
 * Chat déplacé et agrandi (élément du jeu « Chat »). Depuis la 1.21.11, le dessin, le survol et les clics passent tous
 * par la même méthode : la transformation y est ajoutée à la pose. Avant, on décale le dessin et on ramène la souris.
 */
@Mixin(ChatComponent.class)
public class ChatMoveMixin {
	//#if MC >= 12109
	//#if MC >= 260200
	@Inject(method = "extractRenderState(Lnet/minecraft/client/gui/components/ChatComponent$ChatGraphicsAccess;IILnet/minecraft/client/gui/components/ChatComponent$DisplayMode;)V",
		at = @At("HEAD"))
	//#else
	//$$ @Inject(method = "render(Lnet/minecraft/client/gui/components/ChatComponent$ChatGraphicsAccess;IIZ)V", at = @At("HEAD"))
	//#endif
	private void aloriahud$moveChat(CallbackInfo ci, @Local(argsOnly = true) ChatComponent.ChatGraphicsAccess access) {
		float[] t = GameElements.transform("chat");
		if (t == null) return;
		access.updatePose(pose -> pose.translate(t[0], t[1]).scale(t[2]).translate(-t[3], -t[4]));
	}
	//#else
	//$$ @Inject(method = "render", at = @At("HEAD"))
	//$$ private void aloriahud$moveChat(CallbackInfo ci, @Local(argsOnly = true) GuiGraphics graphics) {
	//$$ 	GameElements.begin(graphics, "chat");
	//$$ }
	//$$
	//$$ @Inject(method = "render", at = @At("TAIL"))
	//$$ private void aloriahud$restoreChat(CallbackInfo ci, @Local(argsOnly = true) GuiGraphics graphics) {
	//$$ 	GameElements.end(graphics);
	//$$ }
	//$$
	//$$ @ModifyVariable(method = "screenToChatX", at = @At("HEAD"), argsOnly = true)
	//$$ private double aloriahud$chatMouseX(double x) {
	//$$ 	return GameElements.inverseX("chat", x);
	//$$ }
	//$$
	//$$ @ModifyVariable(method = "screenToChatY", at = @At("HEAD"), argsOnly = true)
	//$$ private double aloriahud$chatMouseY(double y) {
	//$$ 	return GameElements.inverseY("chat", y);
	//$$ }
	//#endif
}
