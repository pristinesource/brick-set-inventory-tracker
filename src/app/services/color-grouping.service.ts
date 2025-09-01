import { Injectable } from '@angular/core';
import { Color } from '../models/models';
import { StorageService } from './storage.service';

export enum ColorGroup {
  BLACK_WHITE_GRAY = 1,
  YELLOW_ORANGE_GREEN_NATURAL = 2,
  BLUE_PINK_PURPLE_COOL = 3,
  BROWN_TAN_RED_EARTH = 4,
  TRANSPARENT = 5,
  OTHER = 6
}

@Injectable({
  providedIn: 'root'
})
export class ColorGroupingService {

  // Explicit mapping of color IDs to groups
  private readonly colorGroupMap = new Map<number, ColorGroup>();

  constructor(private storageService: StorageService) {
    this.initializeColorMappings();
  }

  private initializeColorMappings(): void {
    // Group 1: Black, White & Gray
    this.colorGroupMap.set(-1, ColorGroup.BLACK_WHITE_GRAY); // [Unknown]
    this.colorGroupMap.set(0, ColorGroup.BLACK_WHITE_GRAY);   // Black
    this.colorGroupMap.set(7, ColorGroup.BLACK_WHITE_GRAY);   // Light Gray
    this.colorGroupMap.set(8, ColorGroup.BLACK_WHITE_GRAY);   // Dark Gray
    this.colorGroupMap.set(15, ColorGroup.BLACK_WHITE_GRAY);  // White
    this.colorGroupMap.set(21, ColorGroup.BLACK_WHITE_GRAY);  // Glow In Dark Opaque
    this.colorGroupMap.set(64, ColorGroup.BLACK_WHITE_GRAY);  // Chrome Black
    this.colorGroupMap.set(71, ColorGroup.BLACK_WHITE_GRAY);  // Light Bluish Gray
    this.colorGroupMap.set(72, ColorGroup.BLACK_WHITE_GRAY);  // Dark Bluish Gray
    this.colorGroupMap.set(75, ColorGroup.BLACK_WHITE_GRAY);  // Speckle Black-Copper
    this.colorGroupMap.set(76, ColorGroup.BLACK_WHITE_GRAY);  // Speckle DBGray-Silver
    this.colorGroupMap.set(79, ColorGroup.BLACK_WHITE_GRAY);  // Milky White
    this.colorGroupMap.set(80, ColorGroup.BLACK_WHITE_GRAY);  // Metallic Silver
    this.colorGroupMap.set(132, ColorGroup.BLACK_WHITE_GRAY); // Speckle Black-Silver
    this.colorGroupMap.set(133, ColorGroup.OTHER); // Speckle Black-Gold
    this.colorGroupMap.set(135, ColorGroup.BLACK_WHITE_GRAY); // Pearl Light Gray
    this.colorGroupMap.set(148, ColorGroup.BLACK_WHITE_GRAY); // Pearl Dark Gray
    this.colorGroupMap.set(150, ColorGroup.BLACK_WHITE_GRAY); // Pearl Very Light Gray
    this.colorGroupMap.set(151, ColorGroup.BLACK_WHITE_GRAY); // Very Light Bluish Gray
    this.colorGroupMap.set(179, ColorGroup.BLACK_WHITE_GRAY); // Flat Silver
    this.colorGroupMap.set(183, ColorGroup.BLACK_WHITE_GRAY); // Pearl White
    this.colorGroupMap.set(383, ColorGroup.BLACK_WHITE_GRAY); // Chrome Silver
    this.colorGroupMap.set(503, ColorGroup.BLACK_WHITE_GRAY); // Very Light Gray
    this.colorGroupMap.set(1000, ColorGroup.BLACK_WHITE_GRAY); // Glow in Dark White
    this.colorGroupMap.set(1013, ColorGroup.BLACK_WHITE_GRAY); // Modulex White
    this.colorGroupMap.set(1014, ColorGroup.BLACK_WHITE_GRAY); // Modulex Light Bluish Gray
    this.colorGroupMap.set(1015, ColorGroup.BLACK_WHITE_GRAY); // Modulex Light Gray
    this.colorGroupMap.set(1016, ColorGroup.BLACK_WHITE_GRAY); // Modulex Charcoal Gray
    this.colorGroupMap.set(1017, ColorGroup.BLACK_WHITE_GRAY); // Modulex Tile Gray
    this.colorGroupMap.set(1018, ColorGroup.BLACK_WHITE_GRAY); // Modulex Black
    this.colorGroupMap.set(1039, ColorGroup.BLACK_WHITE_GRAY); // Modulex Clear
    this.colorGroupMap.set(1040, ColorGroup.BLACK_WHITE_GRAY); // Modulex Foil Dark Gray
    this.colorGroupMap.set(1041, ColorGroup.BLACK_WHITE_GRAY); // Modulex Foil Light Gray
    this.colorGroupMap.set(1073, ColorGroup.BLACK_WHITE_GRAY); // Pearl Black
    this.colorGroupMap.set(1085, ColorGroup.BLACK_WHITE_GRAY); // Two-tone Silver
    this.colorGroupMap.set(1103, ColorGroup.BLACK_WHITE_GRAY); // Pearl Titanium
    this.colorGroupMap.set(1135, ColorGroup.BLACK_WHITE_GRAY); // Metal
    this.colorGroupMap.set(1143, ColorGroup.BLACK_WHITE_GRAY); // Glitter Milky White

    // Group 2: Yellow, Orange, Green & Natural (includes lime, aqua, turquoise)
    this.colorGroupMap.set(2, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);   // Green
    this.colorGroupMap.set(3, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);   // Dark Turquoise
    this.colorGroupMap.set(10, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Bright Green
    this.colorGroupMap.set(11, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Light Turquoise
    this.colorGroupMap.set(14, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Yellow
    this.colorGroupMap.set(17, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Light Green
    this.colorGroupMap.set(18, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Light Yellow
    this.colorGroupMap.set(25, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Orange
    this.colorGroupMap.set(27, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Lime
    this.colorGroupMap.set(50, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Chrome Green
    this.colorGroupMap.set(62, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Chrome Green
    this.colorGroupMap.set(68, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Very Light Orange
    this.colorGroupMap.set(74, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Medium Green
    this.colorGroupMap.set(81, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Metallic Green
    this.colorGroupMap.set(115, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Medium Lime
    this.colorGroupMap.set(120, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Light Lime
    this.colorGroupMap.set(125, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Light Orange
    this.colorGroupMap.set(158, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Yellowish Green
    this.colorGroupMap.set(191, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Bright Light Orange
    this.colorGroupMap.set(226, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Bright Light Yellow
    this.colorGroupMap.set(288, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Dark Green
    this.colorGroupMap.set(326, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Olive Green
    this.colorGroupMap.set(366, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Earth Orange
    this.colorGroupMap.set(378, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Sand Green
    this.colorGroupMap.set(462, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Medium Orange
    this.colorGroupMap.set(484, ColorGroup.BROWN_TAN_RED_EARTH); // Dark Orange
    this.colorGroupMap.set(1011, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Vintage Yellow
    this.colorGroupMap.set(1012, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Fabuland Orange
    this.colorGroupMap.set(1025, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Orange
    this.colorGroupMap.set(1026, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Light Orange
    this.colorGroupMap.set(1027, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Light Yellow
    this.colorGroupMap.set(1028, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Ochre Yellow
    this.colorGroupMap.set(1029, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Lemon
    this.colorGroupMap.set(1030, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Pastel Green
    this.colorGroupMap.set(1031, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Olive Green
    this.colorGroupMap.set(1042, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Foil Dark Green
    this.colorGroupMap.set(1043, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Foil Light Green
    this.colorGroupMap.set(1048, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Foil Yellow
    this.colorGroupMap.set(1049, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Modulex Foil Orange
    this.colorGroupMap.set(1062, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Vibrant Yellow
    this.colorGroupMap.set(1066, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Curry
    this.colorGroupMap.set(1071, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Pearl Green
    this.colorGroupMap.set(1076, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Duplo Lime
    this.colorGroupMap.set(1077, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Fabuland Lime
    this.colorGroupMap.set(1078, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Duplo Medium Green
    this.colorGroupMap.set(1079, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Duplo Light Green
    this.colorGroupMap.set(1086, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Pearl Lime
    this.colorGroupMap.set(1090, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Duplo Turquoise
    this.colorGroupMap.set(1091, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Warm Yellowish Orange
    this.colorGroupMap.set(1100, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Clikits Yellow
    this.colorGroupMap.set(1111, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Dark Green
    this.colorGroupMap.set(1112, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Dark Lime
    this.colorGroupMap.set(1114, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Dark Sand Green
    this.colorGroupMap.set(1115, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Dark Turquoise
    this.colorGroupMap.set(1116, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Earth Orange
    this.colorGroupMap.set(1117, ColorGroup.OTHER); // HO Gold
    this.colorGroupMap.set(1120, ColorGroup.OTHER); // HO Light Gold
    this.colorGroupMap.set(1122, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Light Yellow
    this.colorGroupMap.set(1127, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Metallic Green
    this.colorGroupMap.set(1129, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Olive Green
    this.colorGroupMap.set(1132, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // HO Sand Green
    this.colorGroupMap.set(1141, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Neon Green
    this.colorGroupMap.set(1142, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Dark Olive Green
    this.colorGroupMap.set(1145, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Ochre Yellow

    // Group 3: Blue, Pink, Purple & Cool (includes azure, lavender, magenta, violet)
    this.colorGroupMap.set(1, ColorGroup.BLUE_PINK_PURPLE_COOL);   // Blue
    this.colorGroupMap.set(5, ColorGroup.BLUE_PINK_PURPLE_COOL);   // Dark Pink
    this.colorGroupMap.set(9, ColorGroup.BLUE_PINK_PURPLE_COOL);   // Light Blue
    this.colorGroupMap.set(13, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Pink
    this.colorGroupMap.set(20, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Light Violet
    this.colorGroupMap.set(22, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Purple
    this.colorGroupMap.set(23, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Dark Blue-Violet
    this.colorGroupMap.set(26, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Magenta
    this.colorGroupMap.set(29, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Bright Pink
    this.colorGroupMap.set(30, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Medium Lavender
    this.colorGroupMap.set(31, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Lavender
    this.colorGroupMap.set(51, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Chrome Pink
    this.colorGroupMap.set(61, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Chrome Blue
    this.colorGroupMap.set(69, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Light Purple
    this.colorGroupMap.set(73, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Medium Blue
    this.colorGroupMap.set(77, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Light Pink
    this.colorGroupMap.set(85, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Dark Purple
    this.colorGroupMap.set(89, ColorGroup.BLUE_PINK_PURPLE_COOL);  // Royal Blue
    this.colorGroupMap.set(100, ColorGroup.BLUE_PINK_PURPLE_COOL); // Light Salmon
    this.colorGroupMap.set(110, ColorGroup.BLUE_PINK_PURPLE_COOL); // Violet
    this.colorGroupMap.set(112, ColorGroup.BLUE_PINK_PURPLE_COOL); // Medium Bluish Violet
    this.colorGroupMap.set(118, ColorGroup.BLUE_PINK_PURPLE_COOL); // Aqua
    this.colorGroupMap.set(137, ColorGroup.BLUE_PINK_PURPLE_COOL); // Pearl Sand Blue
    this.colorGroupMap.set(212, ColorGroup.BLUE_PINK_PURPLE_COOL); // Bright Light Blue
    this.colorGroupMap.set(232, ColorGroup.BLUE_PINK_PURPLE_COOL); // Sky Blue
    this.colorGroupMap.set(272, ColorGroup.BLUE_PINK_PURPLE_COOL); // Dark Blue
    this.colorGroupMap.set(313, ColorGroup.BLUE_PINK_PURPLE_COOL); // Maersk Blue
    this.colorGroupMap.set(321, ColorGroup.BLUE_PINK_PURPLE_COOL); // Dark Azure
    this.colorGroupMap.set(322, ColorGroup.BLUE_PINK_PURPLE_COOL); // Medium Azure
    this.colorGroupMap.set(323, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Light Aqua
    this.colorGroupMap.set(351, ColorGroup.BLUE_PINK_PURPLE_COOL); // Medium Dark Pink
    this.colorGroupMap.set(373, ColorGroup.BLUE_PINK_PURPLE_COOL); // Sand Purple
    this.colorGroupMap.set(379, ColorGroup.BLUE_PINK_PURPLE_COOL); // Sand Blue
    this.colorGroupMap.set(1001, ColorGroup.BLUE_PINK_PURPLE_COOL); // Medium Violet
    this.colorGroupMap.set(1007, ColorGroup.BLUE_PINK_PURPLE_COOL); // Reddish Lilac
    this.colorGroupMap.set(1008, ColorGroup.BLUE_PINK_PURPLE_COOL); // Vintage Blue
    this.colorGroupMap.set(1032, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Aqua Green
    this.colorGroupMap.set(1033, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Teal Blue
    this.colorGroupMap.set(1034, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Tile Blue
    this.colorGroupMap.set(1035, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Medium Blue
    this.colorGroupMap.set(1036, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Pastel Blue
    this.colorGroupMap.set(1037, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Violet
    this.colorGroupMap.set(1038, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Pink
    this.colorGroupMap.set(1044, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Foil Dark Blue
    this.colorGroupMap.set(1045, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Foil Light Blue
    this.colorGroupMap.set(1046, ColorGroup.BLUE_PINK_PURPLE_COOL); // Modulex Foil Violet
    this.colorGroupMap.set(1050, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL); // Coral
    this.colorGroupMap.set(1051, ColorGroup.BLUE_PINK_PURPLE_COOL); // Pastel Blue
    this.colorGroupMap.set(1070, ColorGroup.BLUE_PINK_PURPLE_COOL); // Pearl Blue
    this.colorGroupMap.set(1074, ColorGroup.BLUE_PINK_PURPLE_COOL); // Duplo Blue
    this.colorGroupMap.set(1075, ColorGroup.BLUE_PINK_PURPLE_COOL); // Duplo Medium Blue
    this.colorGroupMap.set(1082, ColorGroup.BLUE_PINK_PURPLE_COOL); // Clikits Pink
    this.colorGroupMap.set(1087, ColorGroup.BLUE_PINK_PURPLE_COOL); // Duplo Pink
    this.colorGroupMap.set(1093, ColorGroup.BLUE_PINK_PURPLE_COOL); // Light Lilac
    this.colorGroupMap.set(1101, ColorGroup.BLUE_PINK_PURPLE_COOL); // Duplo Dark Purple
    this.colorGroupMap.set(1104, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Aqua
    this.colorGroupMap.set(1105, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Azure
    this.colorGroupMap.set(1106, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Blue-gray
    this.colorGroupMap.set(1107, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Cyan
    this.colorGroupMap.set(1108, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Dark Aqua
    this.colorGroupMap.set(1109, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Dark Blue
    this.colorGroupMap.set(1118, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Light Aqua
    this.colorGroupMap.set(1123, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Medium Blue
    this.colorGroupMap.set(1125, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Metallic Blue
    this.colorGroupMap.set(1128, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Metallic Sand Blue
    this.colorGroupMap.set(1130, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Rose
    this.colorGroupMap.set(1131, ColorGroup.BLUE_PINK_PURPLE_COOL); // HO Sand Blue
    this.colorGroupMap.set(1144, ColorGroup.BLUE_PINK_PURPLE_COOL); // Chrome Red

    // Group 4: Brown, Tan, Red & Earth (includes nougat)
    this.colorGroupMap.set(4, ColorGroup.BROWN_TAN_RED_EARTH);   // Red
    this.colorGroupMap.set(6, ColorGroup.BROWN_TAN_RED_EARTH);   // Brown
    this.colorGroupMap.set(12, ColorGroup.YELLOW_ORANGE_GREEN_NATURAL);  // Salmon
    this.colorGroupMap.set(19, ColorGroup.BROWN_TAN_RED_EARTH);  // Tan
    this.colorGroupMap.set(28, ColorGroup.BROWN_TAN_RED_EARTH);  // Dark Tan
    this.colorGroupMap.set(60, ColorGroup.BROWN_TAN_RED_EARTH);  // Chrome Antique Brass
    this.colorGroupMap.set(63, ColorGroup.BROWN_TAN_RED_EARTH);  // Light Nougat
    this.colorGroupMap.set(70, ColorGroup.BROWN_TAN_RED_EARTH);  // Reddish Brown
    this.colorGroupMap.set(78, ColorGroup.BROWN_TAN_RED_EARTH);  // Light Nougat
    this.colorGroupMap.set(82, ColorGroup.OTHER);  // Metallic Gold
    this.colorGroupMap.set(84, ColorGroup.BROWN_TAN_RED_EARTH);  // Medium Nougat
    this.colorGroupMap.set(86, ColorGroup.BROWN_TAN_RED_EARTH);  // Light Brown
    this.colorGroupMap.set(92, ColorGroup.BROWN_TAN_RED_EARTH);  // Nougat
    this.colorGroupMap.set(134, ColorGroup.BROWN_TAN_RED_EARTH); // Copper
    this.colorGroupMap.set(142, ColorGroup.OTHER); // Pearl Light Gold
    this.colorGroupMap.set(178, ColorGroup.OTHER); // Flat Dark Gold
    this.colorGroupMap.set(216, ColorGroup.BROWN_TAN_RED_EARTH); // Rust
    this.colorGroupMap.set(297, ColorGroup.OTHER); // Pearl Gold
    this.colorGroupMap.set(308, ColorGroup.BROWN_TAN_RED_EARTH); // Dark Brown
    this.colorGroupMap.set(320, ColorGroup.BROWN_TAN_RED_EARTH); // Dark Red
    this.colorGroupMap.set(334, ColorGroup.OTHER); // Chrome Gold
    this.colorGroupMap.set(335, ColorGroup.BROWN_TAN_RED_EARTH); // Sand Red
    this.colorGroupMap.set(450, ColorGroup.BROWN_TAN_RED_EARTH); // Fabuland Brown
    this.colorGroupMap.set(1009, ColorGroup.BROWN_TAN_RED_EARTH); // Vintage Red
    this.colorGroupMap.set(1010, ColorGroup.BROWN_TAN_RED_EARTH); // Vintage Red
    this.colorGroupMap.set(1019, ColorGroup.BROWN_TAN_RED_EARTH); // Modulex Tile Brown
    this.colorGroupMap.set(1020, ColorGroup.BROWN_TAN_RED_EARTH); // Modulex Terracotta
    this.colorGroupMap.set(1021, ColorGroup.BROWN_TAN_RED_EARTH); // Modulex Brown
    this.colorGroupMap.set(1022, ColorGroup.BROWN_TAN_RED_EARTH); // Modulex Buff
    this.colorGroupMap.set(1023, ColorGroup.BROWN_TAN_RED_EARTH); // Modulex Red
    this.colorGroupMap.set(1024, ColorGroup.BROWN_TAN_RED_EARTH); // Modulex Pink Red
    this.colorGroupMap.set(1047, ColorGroup.BROWN_TAN_RED_EARTH); // Modulex Foil Red
    this.colorGroupMap.set(1063, ColorGroup.BROWN_TAN_RED_EARTH); // Pearl Copper
    this.colorGroupMap.set(1064, ColorGroup.BROWN_TAN_RED_EARTH); // Fabuland Red
    this.colorGroupMap.set(1065, ColorGroup.OTHER); // Reddish Gold
    this.colorGroupMap.set(1067, ColorGroup.BROWN_TAN_RED_EARTH); // Dark Nougat
    this.colorGroupMap.set(1068, ColorGroup.BROWN_TAN_RED_EARTH); // Bright Reddish Orange
    this.colorGroupMap.set(1069, ColorGroup.BROWN_TAN_RED_EARTH); // Pearl Red
    this.colorGroupMap.set(1072, ColorGroup.BROWN_TAN_RED_EARTH); // Pearl Brown
    this.colorGroupMap.set(1080, ColorGroup.BROWN_TAN_RED_EARTH); // Light Tan
    this.colorGroupMap.set(1081, ColorGroup.BROWN_TAN_RED_EARTH); // Rust Orange
    this.colorGroupMap.set(1083, ColorGroup.BROWN_TAN_RED_EARTH); // Two-tone Copper
    this.colorGroupMap.set(1084, ColorGroup.OTHER); // Two-tone Gold
    this.colorGroupMap.set(1088, ColorGroup.BROWN_TAN_RED_EARTH); // Medium Brown
    this.colorGroupMap.set(1089, ColorGroup.BROWN_TAN_RED_EARTH); // Warm Tan
    this.colorGroupMap.set(1092, ColorGroup.BROWN_TAN_RED_EARTH); // Metallic Copper
    this.colorGroupMap.set(1113, ColorGroup.BROWN_TAN_RED_EARTH); // HO Dark Red
    this.colorGroupMap.set(1119, ColorGroup.BROWN_TAN_RED_EARTH); // HO Light Brown
    this.colorGroupMap.set(1121, ColorGroup.BROWN_TAN_RED_EARTH); // HO Light Tan
    this.colorGroupMap.set(1124, ColorGroup.BROWN_TAN_RED_EARTH); // HO Medium Red
    this.colorGroupMap.set(1133, ColorGroup.BROWN_TAN_RED_EARTH); // HO Tan
    this.colorGroupMap.set(1136, ColorGroup.BROWN_TAN_RED_EARTH); // Reddish Orange
    this.colorGroupMap.set(1137, ColorGroup.BROWN_TAN_RED_EARTH); // Sienna Brown
    this.colorGroupMap.set(1138, ColorGroup.BROWN_TAN_RED_EARTH); // Umber Brown
    this.colorGroupMap.set(1140, ColorGroup.BROWN_TAN_RED_EARTH); // Neon Orange

    // Group 5: Transparent (all transparent colors regardless of base color)
    this.colorGroupMap.set(32, ColorGroup.TRANSPARENT);  // Trans-Black IR Lens
    this.colorGroupMap.set(33, ColorGroup.TRANSPARENT);  // Trans-Dark Blue
    this.colorGroupMap.set(34, ColorGroup.TRANSPARENT);  // Trans-Green
    this.colorGroupMap.set(35, ColorGroup.TRANSPARENT);  // Trans-Bright Green
    this.colorGroupMap.set(36, ColorGroup.TRANSPARENT);  // Trans-Red
    this.colorGroupMap.set(40, ColorGroup.TRANSPARENT);  // Trans-Brown
    this.colorGroupMap.set(41, ColorGroup.TRANSPARENT);  // Trans-Light Blue
    this.colorGroupMap.set(42, ColorGroup.TRANSPARENT);  // Trans-Neon Green
    this.colorGroupMap.set(43, ColorGroup.TRANSPARENT);  // Trans-Very Lt Blue
    this.colorGroupMap.set(45, ColorGroup.TRANSPARENT);  // Trans-Dark Pink
    this.colorGroupMap.set(46, ColorGroup.TRANSPARENT);  // Trans-Yellow
    this.colorGroupMap.set(47, ColorGroup.TRANSPARENT);  // Trans-Clear
    this.colorGroupMap.set(52, ColorGroup.TRANSPARENT);  // Trans-Purple
    this.colorGroupMap.set(54, ColorGroup.TRANSPARENT);  // Trans-Neon Yellow
    this.colorGroupMap.set(57, ColorGroup.TRANSPARENT);  // Trans-Neon Orange
    this.colorGroupMap.set(114, ColorGroup.TRANSPARENT); // Glitter Trans-Dark Pink
    this.colorGroupMap.set(117, ColorGroup.TRANSPARENT); // Glitter Trans-Clear
    this.colorGroupMap.set(129, ColorGroup.TRANSPARENT); // Glitter Trans-Purple
    this.colorGroupMap.set(143, ColorGroup.TRANSPARENT); // Trans-Medium Blue
    this.colorGroupMap.set(182, ColorGroup.TRANSPARENT); // Trans-Orange
    this.colorGroupMap.set(230, ColorGroup.TRANSPARENT); // Trans-Pink
    this.colorGroupMap.set(236, ColorGroup.TRANSPARENT); // Trans-Light Purple
    this.colorGroupMap.set(294, ColorGroup.TRANSPARENT); // Glow In Dark Trans
    this.colorGroupMap.set(1002, ColorGroup.TRANSPARENT); // Glitter Trans-Neon Green
    this.colorGroupMap.set(1003, ColorGroup.TRANSPARENT); // Glitter Trans-Light Blue
    this.colorGroupMap.set(1004, ColorGroup.TRANSPARENT); // Trans-Flame Yellowish Orange
    this.colorGroupMap.set(1005, ColorGroup.TRANSPARENT); // Trans-Fire Yellow
    this.colorGroupMap.set(1006, ColorGroup.TRANSPARENT); // Trans-Light Royal Blue
    this.colorGroupMap.set(1052, ColorGroup.TRANSPARENT); // Glitter Trans-Orange
    this.colorGroupMap.set(1053, ColorGroup.TRANSPARENT); // Opal Trans-Light Blue
    this.colorGroupMap.set(1054, ColorGroup.TRANSPARENT); // Opal Trans-Dark Pink
    this.colorGroupMap.set(1055, ColorGroup.TRANSPARENT); // Opal Trans-Clear
    this.colorGroupMap.set(1056, ColorGroup.TRANSPARENT); // Opal Trans-Brown
    this.colorGroupMap.set(1057, ColorGroup.TRANSPARENT); // Trans-Light Bright Green
    this.colorGroupMap.set(1058, ColorGroup.TRANSPARENT); // Trans-Light Green
    this.colorGroupMap.set(1059, ColorGroup.TRANSPARENT); // Opal Trans-Purple
    this.colorGroupMap.set(1060, ColorGroup.TRANSPARENT); // Opal Trans-Bright Green
    this.colorGroupMap.set(1061, ColorGroup.TRANSPARENT); // Opal Trans-Dark Blue
    this.colorGroupMap.set(1094, ColorGroup.TRANSPARENT); // Trans-Medium Purple
    this.colorGroupMap.set(1095, ColorGroup.TRANSPARENT); // Trans-Black
    this.colorGroupMap.set(1096, ColorGroup.TRANSPARENT); // Glitter Trans-Bright Green
    this.colorGroupMap.set(1097, ColorGroup.TRANSPARENT); // Glitter Trans-Medium Purple
    this.colorGroupMap.set(1098, ColorGroup.TRANSPARENT); // Glitter Trans-Green
    this.colorGroupMap.set(1099, ColorGroup.TRANSPARENT); // Glitter Trans-Pink
    this.colorGroupMap.set(1102, ColorGroup.TRANSPARENT); // Trans-Neon Red
    this.colorGroupMap.set(1139, ColorGroup.TRANSPARENT); // Opal Trans-Yellow

    // Group 6: Other Colors (anything not explicitly categorized above)
    // Note: Colors not in the map will automatically fall back to ColorGroup.OTHER
  }

  /**
   * Get the color group for a given color ID
   */
  getColorGroup(colorId: number): ColorGroup {
    return this.colorGroupMap.get(colorId) ?? ColorGroup.OTHER;
  }

  /**
   * Get the display name for a color group
   */
  getColorGroupName(group: ColorGroup | number): string {
    const colorGroup = typeof group === 'number' ? group as ColorGroup : group;
    switch (colorGroup) {
      case ColorGroup.BLACK_WHITE_GRAY:
        return 'Black, White & Gray';
      case ColorGroup.YELLOW_ORANGE_GREEN_NATURAL:
        return 'Yellow, Orange, Green & Natural';
      case ColorGroup.BLUE_PINK_PURPLE_COOL:
        return 'Blue, Pink, Purple & Cool';
      case ColorGroup.BROWN_TAN_RED_EARTH:
        return 'Brown, Tan, Red & Earth';
      case ColorGroup.TRANSPARENT:
        return 'Transparent';
      case ColorGroup.OTHER:
        return 'Other Colors';
      default:
        return 'Other Colors';
    }
  }

  /**
   * Get all color IDs for a specific group
   */
  getColorIdsForGroup(group: ColorGroup): number[] {
    const colorIds: number[] = [];
    for (const [colorId, groupValue] of this.colorGroupMap.entries()) {
      if (groupValue === group) {
        colorIds.push(colorId);
      }
    }
    return colorIds.sort((a, b) => a - b);
  }

  /**
   * Add or update a color mapping
   */
  updateColorMapping(colorId: number, group: ColorGroup): void {
    this.colorGroupMap.set(colorId, group);
  }

  /**
   * Remove a color mapping (will fall back to OTHER group)
   */
  removeColorMapping(colorId: number): void {
    this.colorGroupMap.delete(colorId);
  }

  /**
   * Get all color mappings
   */
  getAllColorMappings(): Map<number, ColorGroup> {
    return new Map(this.colorGroupMap);
  }

  // My Colors functionality methods

  /**
   * Get the effective color ID for a given color, considering aliases
   * @param colorId The original color ID
   * @returns The primary color ID if the color is part of an alias, otherwise the original color ID
   */
  getEffectiveColorId(colorId: number): number {
    const alias = this.storageService.isColorInAlias(colorId);
    return alias ? alias.primaryColorId : colorId;
  }

  /**
   * Get all color IDs that should be treated as the same color due to aliasing
   * @param colorId The color ID to check
   * @returns Array of color IDs that are aliased together (including the input color)
   */
  getAliasedColorIds(colorId: number): number[] {
    const alias = this.storageService.isColorInAlias(colorId);
    return alias ? alias.colorIds : [colorId];
  }

  /**
   * Check if a color should be shown based on My Colors settings
   * @param colorId The color ID to check
   * @param forceShowAll Override to show all colors regardless of settings
   * @returns true if the color should be shown
   */
  shouldShowColor(colorId: number, forceShowAll: boolean = false): boolean {
    if (forceShowAll) {
      return true;
    }

    const myColorsSettings = this.storageService.getMyColorsSettings();

    // If no colors are enabled, show all colors
    if (myColorsSettings.enabledColorIds.length === 0) {
      return true;
    }

    // Check if this color or any of its aliases are in the enabled list
    const aliasedColors = this.getAliasedColorIds(colorId);
    return aliasedColors.some(id => myColorsSettings.enabledColorIds.includes(id));
  }

  /**
   * Filter a list of colors based on My Colors settings
   * @param colors Array of colors to filter
   * @param forceShowAll Override to show all colors
   * @returns Filtered array of colors
   */
  filterColors(colors: Color[], forceShowAll: boolean = false): Color[] {
    if (forceShowAll) {
      return colors;
    }

    const myColorsSettings = this.storageService.getMyColorsSettings();

    // If no colors are enabled, show all colors
    if (myColorsSettings.enabledColorIds.length === 0) {
      return colors;
    }

    return colors.filter(color => this.shouldShowColor(color.id, forceShowAll));
  }

  /**
   * Group colors by their primary color (for aliased colors)
   * @param colors Array of colors to group
   * @returns Map of primary color ID to array of color IDs
   */
  groupColorsByAlias(colors: Color[]): Map<number, Color[]> {
    const groups = new Map<number, Color[]>();

    for (const color of colors) {
      const primaryColorId = this.getEffectiveColorId(color.id);

      if (!groups.has(primaryColorId)) {
        groups.set(primaryColorId, []);
      }

      groups.get(primaryColorId)!.push(color);
    }

    return groups;
  }

  /**
   * Get the display name for a color, considering aliases
   * @param colorId The color ID
   * @param colors Map or array of colors
   * @returns The color name, or alias name if applicable
   */
  getColorDisplayName(colorId: number, colors: Map<number, Color> | Color[]): string {
    const alias = this.storageService.isColorInAlias(colorId);

    if (alias) {
      return alias.name;
    }

    // Get the color from the provided colors
    let color: Color | undefined;

    if (Array.isArray(colors)) {
      color = colors.find(c => c.id === colorId);
    } else {
      color = colors.get(colorId);
    }

    return color?.name || `Color ${colorId}`;
  }

  /**
   * Combine quantities for aliased colors
   * @param colorQuantities Record of color ID to quantity
   * @returns Record of primary color ID to combined quantity
   */
  combineAliasedQuantities(colorQuantities: Record<number, number>): Record<number, number> {
    const combined: Record<number, number> = {};

    for (const [colorId, quantity] of Object.entries(colorQuantities)) {
      const primaryColorId = this.getEffectiveColorId(Number(colorId));
      combined[primaryColorId] = (combined[primaryColorId] || 0) + quantity;
    }

    return combined;
  }

  /**
   * Get the color to display for parts (considering aliases)
   * @param originalColorId The original color ID
   * @param colors Map or array of available colors
   * @returns The color object to use for display
   */
  getDisplayColor(originalColorId: number, colors: Map<number, Color> | Color[]): Color | undefined {
    const primaryColorId = this.getEffectiveColorId(originalColorId);

    if (Array.isArray(colors)) {
      return colors.find(c => c.id === primaryColorId);
    } else {
      return colors.get(primaryColorId);
    }
  }

  /**
   * Check if My Colors filtering should be applied to sets
   * @returns true if color filtering should apply to sets
   */
  shouldApplyToSets(): boolean {
    const myColorsSettings = this.storageService.getMyColorsSettings();
    return myColorsSettings.applyToSets;
  }

  /**
   * Get hidden colors count for a list of colors
   * @param allColors All available colors
   * @returns Number of hidden colors
   */
  getHiddenColorsCount(allColors: Color[]): number {
    const myColorsSettings = this.storageService.getMyColorsSettings();

    // If no colors are enabled, none are hidden
    if (myColorsSettings.enabledColorIds.length === 0) {
      return 0;
    }

    return allColors.filter(color => !this.shouldShowColor(color.id)).length;
  }
}
