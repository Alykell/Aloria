package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.Fonts;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.ItemStack;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * Armure portée et objet en main, avec la durabilité restante.
 * Les emplacements vides restent visibles (silhouette pâle), comme dans l'inventaire.
 */
public final class ArmorModule extends HudModule {
	private record Slot(ItemStack stack, @Nullable Identifier emptySprite) {
	}

	private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
	private static final Identifier[] EMPTY = {
		InventoryMenu.EMPTY_ARMOR_SLOT_HELMET,
		InventoryMenu.EMPTY_ARMOR_SLOT_CHESTPLATE,
		InventoryMenu.EMPTY_ARMOR_SLOT_LEGGINGS,
		InventoryMenu.EMPTY_ARMOR_SLOT_BOOTS
	};
	private static final int ROW = 17;
	private static final int PAD = 3;

	public ArmorModule() {
		super("armor", "Armure");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 1f, 0.45f);
	}

	@Override
	public String category() {
		return "pvp";
	}

	private static List<Slot> slots(Minecraft mc) {
		List<Slot> list = new ArrayList<>();
		if (mc.player == null) {
			// Pas de partie chargée : on ne peut pas créer d'objets (composants non liés), silhouettes vides
			for (Identifier sprite : EMPTY) list.add(new Slot(ItemStack.EMPTY, sprite));
			return list;
		}
		for (int i = 0; i < ARMOR.length; i++) list.add(new Slot(mc.player.getItemBySlot(ARMOR[i]), EMPTY[i]));
		ItemStack hand = mc.player.getMainHandItem();
		if (!hand.isEmpty()) list.add(new Slot(hand, null));
		return list;
	}

	private static String label(ItemStack stack) {
		if (stack.isEmpty()) return "";
		if (stack.isDamageableItem()) return String.valueOf(stack.getMaxDamage() - stack.getDamageValue());
		return stack.getCount() > 1 ? String.valueOf(stack.getCount()) : "";
	}

	/** Vert → jaune → rouge selon l'usure */
	private static int durabilityColor(ItemStack stack, int fallback) {
		if (!stack.isDamageableItem()) return fallback;
		float ratio = 1f - (float) stack.getDamageValue() / stack.getMaxDamage();
		if (ratio > 0.5f) return 0xFF7BE495;
		if (ratio > 0.2f) return 0xFFFFD166;
		return 0xFFFF6B6B;
	}

	@Override
	public int width(Minecraft mc, ModuleSettings s, boolean preview) {
		int text = 0;
		for (Slot slot : slots(mc)) text = Math.max(text, Fonts.width(mc, s.font, label(slot.stack())));
		return PAD * 2 + 16 + (text > 0 ? text + 5 : 0);
	}

	@Override
	public int height(Minecraft mc, ModuleSettings s, boolean preview) {
		return slots(mc).size() * ROW - 1 + PAD * 2;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
		Draw.panel(g, 0, 0, width(mc, s, preview), height(mc, s, preview), s);
		int y = PAD;
		for (Slot slot : slots(mc)) {
			if (slot.stack().isEmpty()) {
				if (slot.emptySprite() != null) g.blitSprite(RenderPipelines.GUI_TEXTURED, slot.emptySprite(), PAD, y, 16, 16, 0.45f);
			} else {
				g.item(slot.stack(), PAD, y);
				String label = label(slot.stack());
				if (!label.isEmpty()) Fonts.draw(g, mc, s.font, label, PAD + 21, y + 4, durabilityColor(slot.stack(), Draw.textColor(s)), s.shadow);
			}
			y += ROW;
		}
	}
}
