package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.GameElements;
import net.minecraft.client.gui.hud.ChatHud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Chat déplacé et agrandi (élément du jeu) ; la souris est ramenée à sa place habituelle pour les clics. */
@Mixin(ChatHud.class)
public class ChatMoveMixin {
	@Inject(method = "render", at = @At("HEAD"))
	private void aloriahud$moveChat(int ticks, CallbackInfo ci) {
		GameElements.beginChat();
	}

	@Inject(method = "render", at = @At("TAIL"))
	private void aloriahud$restoreChat(int ticks, CallbackInfo ci) {
		GameElements.end();
	}

	@ModifyVariable(method = "getTextAt", at = @At("HEAD"), argsOnly = true, ordinal = 0)
	private int aloriahud$chatMouseX(int x) {
		return GameElements.chatMouseX(x);
	}

	@ModifyVariable(method = "getTextAt", at = @At("HEAD"), argsOnly = true, ordinal = 1)
	private int aloriahud$chatMouseY(int y) {
		return GameElements.chatMouseY(y);
	}
}
