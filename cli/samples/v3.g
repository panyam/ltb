
Elements -> Elements Seperator Atoms;
Elements -> Atoms ;

Seperator -> Command | RoleSelector ;

Command -> BSLASH_IDENT ;
Command -> BSLASH_IDENT CommandParams ;
CommandParams  -> OPEN_PAREN  CLOSE_PAREN ;
CommandParams -> OPEN_PAREN ParamList CLOSE_PAREN ;

ParamList -> Param ;
ParamList -> ParamList COMMA Param ;
Param -> ParamKey ;
Param -> ParamKey EQUALS ParamValue ;
ParamKey  -> STRING ;
ParamKey  -> Fraction ;
ParamKey  -> IDENT ;
ParamValue -> STRING ;
ParamValue -> Fraction ;
ParamValue -> IDENT ;

RoleSelector -> IDENT_COLON ;

Atoms -> Atoms Atom ;
Atoms -> ;

Atom -> Duration Leaf ;
Atom -> Leaf ;

Leaf -> Space | Lit | Group ;

Space -> COMMA | SEMI_COLON | UNDER_SCORE ;
Lit -> DOT_IDENT | IDENT | IDENT_DOT | STRING ;
Group -> OPEN_SQ Atoms CLOSE_SQ ;

Duration -> Fraction ;
Fraction -> NUMBER ;
Fraction -> NUMBER SLASH NUMBER ;

